#include "voice_memory_reader.h"
#include "sqlite3.h"
#include <openssl/rand.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if !SQLITE_OS_OTHER || !defined(SQLITE_OMIT_LOAD_EXTENSION) || !defined(SQLITE_OMIT_DESERIALIZE) || !defined(SQLCIPHER_OMIT_DEFAULT_LOGGING)
#error "Reader requires no disk VFS, extension loader, deserialize bypass or default logging"
#endif

#define SNAPSHOT_LIMIT (64u * 1024u * 1024u)
#define COLUMN_LIMIT 98304u
#define ROW_LIMIT 1024u
#define SNAPSHOT_PATH "/vqs-snapshot"

struct VqsReader {
    unsigned char *bytes;
    size_t length;
    sqlite3 *database;
    exsqlite3_vfs vfs;
    char vfs_name[40];
    int registered, active_visits, ticks;
    VqsStats counters;
};
typedef struct { exsqlite3_file base; VqsReader *owner; } MemoryFile;

#ifdef VQS_TEST
static void (*before_free)(const unsigned char *, size_t);
#endif

static void wipe(void *buffer, size_t length) {
    volatile unsigned char *owned = buffer;
    while (length--) *owned++ = 0;
}

/* OS_OTHER supplies no threaded default. Install real locks before SQLite init;
 * this hidden engine never exposes shutdown or shares the app's SQLite state. */
typedef struct {
    pthread_mutex_t lock;
    _Atomic uintptr_t owner;
    _Atomic unsigned depth;
    int dynamic;
} ReaderMutex;
static ReaderMutex static_mutexes[12];
static ReaderMutex engine_gate;
static pthread_once_t mutex_once = PTHREAD_ONCE_INIT;
static pthread_once_t engine_once = PTHREAD_ONCE_INIT;
static _Thread_local unsigned char thread_identity;
static int mutex_status = SQLITE_ERROR, engine_status = SQLITE_ERROR;

static int initialize_mutex(ReaderMutex *mutex, int recursive) {
    pthread_mutexattr_t attributes;
    if (pthread_mutexattr_init(&attributes)) return SQLITE_ERROR;
    int status = recursive ? pthread_mutexattr_settype(&attributes, PTHREAD_MUTEX_RECURSIVE) : 0;
    if (!status) status = pthread_mutex_init(&mutex->lock, &attributes);
    pthread_mutexattr_destroy(&attributes);
    atomic_init(&mutex->owner, 0);
    atomic_init(&mutex->depth, 0);
    return status ? SQLITE_ERROR : SQLITE_OK;
}
static void initialize_static_mutexes(void) {
    if (initialize_mutex(&engine_gate, 1)) return;
    for (size_t index = 0; index < 12; index++)
        if (initialize_mutex(&static_mutexes[index], 1)) return;
    mutex_status = SQLITE_OK;
}
static int mutex_init(void) {
    if (pthread_once(&mutex_once, initialize_static_mutexes)) return SQLITE_ERROR;
    return mutex_status;
}
/* Static locks retain library lifetime; all dynamic locks are freed on close. */
static int mutex_end(void) { return SQLITE_OK; }
static exsqlite3_mutex *mutex_alloc(int kind) {
    if (mutex_init() || kind < 0 || kind > 13) return NULL;
    if (kind >= 2) return (exsqlite3_mutex *)&static_mutexes[kind - 2];
    ReaderMutex *mutex = calloc(1, sizeof(*mutex));
    if (!mutex) return NULL;
    if (initialize_mutex(mutex, kind == SQLITE_MUTEX_RECURSIVE)) { free(mutex); return NULL; }
    mutex->dynamic = 1;
    return (exsqlite3_mutex *)mutex;
}
static void mutex_free(exsqlite3_mutex *opaque) {
    ReaderMutex *mutex = (ReaderMutex *)opaque;
    if (!mutex->dynamic) return;
    if (pthread_mutex_destroy(&mutex->lock)) abort();
    free(mutex);
}
static void record_lock(ReaderMutex *mutex) {
    atomic_store(&mutex->owner, (uintptr_t)&thread_identity);
    atomic_fetch_add(&mutex->depth, 1);
}
static void mutex_enter(exsqlite3_mutex *opaque) {
    ReaderMutex *mutex = (ReaderMutex *)opaque;
    if (pthread_mutex_lock(&mutex->lock)) abort();
    record_lock(mutex);
}
static int mutex_try(exsqlite3_mutex *opaque) {
    ReaderMutex *mutex = (ReaderMutex *)opaque;
    if (pthread_mutex_trylock(&mutex->lock)) return SQLITE_BUSY;
    record_lock(mutex);
    return SQLITE_OK;
}
static int mutex_held(exsqlite3_mutex *opaque) {
    ReaderMutex *mutex = (ReaderMutex *)opaque;
    return !mutex || (atomic_load(&mutex->owner) == (uintptr_t)&thread_identity && atomic_load(&mutex->depth));
}
static int mutex_notheld(exsqlite3_mutex *opaque) { return !opaque || !mutex_held(opaque); }
static void mutex_leave(exsqlite3_mutex *opaque) {
    ReaderMutex *mutex = (ReaderMutex *)opaque;
    if (!mutex_held(opaque)) abort();
    if (atomic_fetch_sub(&mutex->depth, 1) == 1) atomic_store(&mutex->owner, 0);
    if (pthread_mutex_unlock(&mutex->lock)) abort();
}
static void initialize_engine(void) {
    static const exsqlite3_mutex_methods methods = {
        mutex_init, mutex_end, mutex_alloc, mutex_free, mutex_enter,
        mutex_try, mutex_leave, mutex_held, mutex_notheld
    };
    if (exsqlite3_config(SQLITE_CONFIG_MUTEX, &methods) != SQLITE_OK) return;
    if (exsqlite3_initialize() != SQLITE_OK) return;
    if (exsqlite3_vfs_find(NULL) != NULL) return;
    engine_status = SQLITE_OK;
}

/* SQLite registers no OS interface; every connection must explicitly use our VFS. */
int exsqlite3_os_init(void) { return SQLITE_OK; }
int exsqlite3_os_end(void) { return SQLITE_OK; }

static int file_close(exsqlite3_file *file) {
    file->pMethods = NULL;
    return SQLITE_OK;
}
static int file_read(exsqlite3_file *file, void *output, int amount, sqlite3_int64 offset) {
    VqsReader *reader = ((MemoryFile *)file)->owner;
    if (amount < 0) return SQLITE_IOERR_READ;
    memset(output, 0, (size_t)amount);
    reader->counters.reads++;
    if (offset < 0) return SQLITE_IOERR_READ;
    if ((uint64_t)offset > reader->length) return SQLITE_IOERR_SHORT_READ;
    size_t available = reader->length - (size_t)offset;
    size_t copied = available < (size_t)amount ? available : (size_t)amount;
    memcpy(output, reader->bytes + (size_t)offset, copied);
    reader->counters.bytes_read += copied;
    return copied == (size_t)amount ? SQLITE_OK : SQLITE_IOERR_SHORT_READ;
}
static int file_write(exsqlite3_file *file, const void *input, int amount, sqlite3_int64 offset) {
    (void)input; (void)amount; (void)offset;
    ((MemoryFile *)file)->owner->counters.denied_writes++;
    return SQLITE_READONLY;
}
static int file_truncate(exsqlite3_file *file, sqlite3_int64 size) {
    (void)size;
    ((MemoryFile *)file)->owner->counters.denied_writes++;
    return SQLITE_READONLY;
}
static int file_sync(exsqlite3_file *file, int flags) {
    (void)flags;
    ((MemoryFile *)file)->owner->counters.denied_writes++;
    return SQLITE_READONLY;
}
static int file_size(exsqlite3_file *file, sqlite3_int64 *length) {
    *length = (sqlite3_int64)((MemoryFile *)file)->owner->length;
    return SQLITE_OK;
}
static int file_lock(exsqlite3_file *file, int level) {
    (void)file;
    return level <= SQLITE_LOCK_SHARED ? SQLITE_OK : SQLITE_READONLY;
}
static int file_unlock(exsqlite3_file *file, int level) { (void)file; (void)level; return SQLITE_OK; }
static int file_reserved(exsqlite3_file *file, int *reserved) { (void)file; *reserved = 0; return SQLITE_OK; }
static int file_control(exsqlite3_file *file, int operation, void *argument) {
    switch (operation) {
        case SQLITE_FCNTL_LOCKSTATE: *(int *)argument = SQLITE_LOCK_NONE; return SQLITE_OK;
        case SQLITE_FCNTL_HAS_MOVED: *(int *)argument = 0; return SQLITE_OK;
        case SQLITE_FCNTL_MMAP_SIZE: *(sqlite3_int64 *)argument = 0; return SQLITE_OK;
        case SQLITE_FCNTL_VFS_POINTER: *(exsqlite3_vfs **)argument = &((MemoryFile *)file)->owner->vfs; return SQLITE_OK;
        default: return SQLITE_NOTFOUND;
    }
}
static int file_sector(exsqlite3_file *file) { (void)file; return 4096; }
static int file_characteristics(exsqlite3_file *file) { (void)file; return SQLITE_IOCAP_IMMUTABLE; }
static const exsqlite3_io_methods memory_methods = {
    .iVersion = 1, .xClose = file_close, .xRead = file_read, .xWrite = file_write,
    .xTruncate = file_truncate, .xSync = file_sync, .xFileSize = file_size,
    .xLock = file_lock, .xUnlock = file_unlock, .xCheckReservedLock = file_reserved,
    .xFileControl = file_control, .xSectorSize = file_sector, .xDeviceCharacteristics = file_characteristics
};

static int vfs_open(exsqlite3_vfs *vfs, sqlite3_filename name, exsqlite3_file *file, int flags, int *out_flags) {
    VqsReader *reader = vfs->pAppData;
    file->pMethods = NULL;
    int forbidden = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_DELETEONCLOSE |
            SQLITE_OPEN_MAIN_JOURNAL | SQLITE_OPEN_TEMP_DB | SQLITE_OPEN_TEMP_JOURNAL |
            SQLITE_OPEN_TRANSIENT_DB | SQLITE_OPEN_SUBJOURNAL | SQLITE_OPEN_SUPER_JOURNAL | SQLITE_OPEN_WAL;
    if (name == NULL || strcmp(name, SNAPSHOT_PATH) != 0 || (flags & forbidden) ||
            !(flags & SQLITE_OPEN_MAIN_DB) || !(flags & SQLITE_OPEN_READONLY) ||
            !(flags & SQLITE_OPEN_URI) || !exsqlite3_uri_boolean(name, "immutable", 0)) {
        reader->counters.denied_opens++;
        return SQLITE_CANTOPEN;
    }
    ((MemoryFile *)file)->owner = reader;
    file->pMethods = &memory_methods;
    if (out_flags) *out_flags = SQLITE_OPEN_READONLY;
    return SQLITE_OK;
}
static int vfs_delete(exsqlite3_vfs *vfs, const char *name, int sync_dir) {
    (void)name; (void)sync_dir;
    ((VqsReader *)vfs->pAppData)->counters.denied_deletes++;
    return SQLITE_READONLY;
}
static int vfs_access(exsqlite3_vfs *vfs, const char *name, int flags, int *accessible) {
    *accessible = 0;
    if (!name || strcmp(name, SNAPSHOT_PATH) != 0) {
        ((VqsReader *)vfs->pAppData)->counters.denied_opens++;
        return SQLITE_IOERR_ACCESS;
    }
    *accessible = flags != SQLITE_ACCESS_READWRITE;
    return SQLITE_OK;
}
static int vfs_path(exsqlite3_vfs *vfs, const char *name, int capacity, char *output) {
    if (!name || strcmp(name, SNAPSHOT_PATH) != 0 || capacity < (int)sizeof(SNAPSHOT_PATH)) {
        ((VqsReader *)vfs->pAppData)->counters.denied_opens++;
        return SQLITE_CANTOPEN;
    }
    memcpy(output, SNAPSHOT_PATH, sizeof(SNAPSHOT_PATH));
    return SQLITE_OK;
}
static void *vfs_dlopen(exsqlite3_vfs *vfs, const char *name) { (void)vfs; (void)name; return NULL; }
static void vfs_dlerror(exsqlite3_vfs *vfs, int capacity, char *output) {
    (void)vfs;
    if (capacity > 0) output[0] = 0;
}
static void (*vfs_dlsym(exsqlite3_vfs *vfs, void *handle, const char *name))(void) {
    (void)vfs; (void)handle; (void)name; return NULL;
}
static void vfs_dlclose(exsqlite3_vfs *vfs, void *handle) { (void)vfs; (void)handle; }
static int vfs_random(exsqlite3_vfs *vfs, int amount, char *output) {
    (void)vfs;
    if (amount < 0 || amount > 4096) return 0;
    if (RAND_bytes((unsigned char *)output, amount) == 1) return amount;
    wipe(output, (size_t)amount);
    return 0;
}
static int vfs_sleep(exsqlite3_vfs *vfs, int microseconds) { (void)vfs; (void)microseconds; return 0; }
static int vfs_time(exsqlite3_vfs *vfs, double *julian) {
    (void)vfs;
    struct timespec now;
    if (timespec_get(&now, TIME_UTC) != TIME_UTC) return SQLITE_ERROR;
    *julian = 2440587.5 + (double)now.tv_sec / 86400.0;
    return SQLITE_OK;
}
static int vfs_error(exsqlite3_vfs *vfs, int capacity, char *output) {
    (void)vfs;
    if (capacity > 0) output[0] = 0;
    return SQLITE_IOERR;
}
static void initialize_vfs(VqsReader *reader) {
    snprintf(reader->vfs_name, sizeof(reader->vfs_name), "vqs-%p", (void *)reader);
    reader->vfs = (exsqlite3_vfs){
        .iVersion = 1, .szOsFile = sizeof(MemoryFile), .mxPathname = 64,
        .zName = reader->vfs_name, .pAppData = reader, .xOpen = vfs_open,
        .xDelete = vfs_delete, .xAccess = vfs_access, .xFullPathname = vfs_path,
        .xDlOpen = vfs_dlopen, .xDlError = vfs_dlerror, .xDlSym = vfs_dlsym, .xDlClose = vfs_dlclose,
        .xRandomness = vfs_random, .xSleep = vfs_sleep, .xCurrentTime = vfs_time, .xGetLastError = vfs_error
    };
}

static int authorize(void *context, int action, const char *first, const char *second,
                     const char *database, const char *origin) {
    (void)context; (void)database; (void)origin;
    if (action == SQLITE_SELECT || action == SQLITE_READ) return SQLITE_OK;
    if (action == SQLITE_FUNCTION && second && (!strcmp(second, "count") || !strcmp(second, "like"))) return SQLITE_OK;
    if (action == SQLITE_PRAGMA && !second && first &&
            (!strcmp(first, "integrity_check") || !strcmp(first, "cipher_integrity_check") ||
             !strcmp(first, "page_size") || !strcmp(first, "page_count") || !strcmp(first, "user_version"))) return SQLITE_OK;
    return SQLITE_DENY;
}
static int progress(void *context) { return ++((VqsReader *)context)->ticks > 10000; }
static int execute(sqlite3 *database, const char *sql) {
    return exsqlite3_exec(database, sql, NULL, NULL, NULL) == SQLITE_OK ? VQS_OK : VQS_ENGINE;
}
static int integer_result(sqlite3 *database, const char *sql, sqlite3_int64 *integer) {
    exsqlite3_stmt *statement = NULL;
    int status = VQS_ENGINE;
    if (exsqlite3_prepare_v2(database, sql, -1, &statement, NULL) != SQLITE_OK) goto done;
    if (exsqlite3_step(statement) != SQLITE_ROW || exsqlite3_column_type(statement, 0) != SQLITE_INTEGER) goto done;
    *integer = exsqlite3_column_int64(statement, 0);
    if (exsqlite3_step(statement) == SQLITE_DONE) status = VQS_OK;
done:
    if (exsqlite3_finalize(statement) != SQLITE_OK) status = VQS_ENGINE;
    return status;
}
static int cipher_version(sqlite3 *database) {
    exsqlite3_stmt *statement = NULL;
    int status = VQS_ENGINE;
    if (exsqlite3_prepare_v2(database, "PRAGMA cipher_version", -1, &statement, NULL) != SQLITE_OK) goto done;
    if (exsqlite3_step(statement) != SQLITE_ROW || exsqlite3_column_type(statement, 0) != SQLITE_TEXT) goto done;
    const unsigned char *version = exsqlite3_column_text(statement, 0);
    int length = exsqlite3_column_bytes(statement, 0);
    if (!version || length < 5 || memcmp(version, "4.7.0", 5) || (length > 5 && version[5] != ' ')) goto done;
    if (exsqlite3_step(statement) == SQLITE_DONE) status = VQS_OK;
done:
    if (exsqlite3_finalize(statement) != SQLITE_OK) status = VQS_ENGINE;
    return status;
}
static int text_result_matches(sqlite3 *database, const char *sql, const char *expected) {
    exsqlite3_stmt *statement = NULL;
    int status = VQS_ENGINE;
    if (exsqlite3_prepare_v2(database, sql, -1, &statement, NULL) != SQLITE_OK) goto done;
    if (exsqlite3_step(statement) != SQLITE_ROW || exsqlite3_column_type(statement, 0) != SQLITE_TEXT ||
            exsqlite3_column_bytes(statement, 0) != (int)strlen(expected)) goto done;
    const unsigned char *flag = exsqlite3_column_text(statement, 0);
    if (!flag || memcmp(flag, expected, strlen(expected))) goto done;
    if (exsqlite3_step(statement) == SQLITE_DONE) status = VQS_OK;
done:
    if (exsqlite3_finalize(statement) != SQLITE_OK) status = VQS_ENGINE;
    return status;
}
static int keyed(VqsReader *reader, const VqsInput *input) {
    if (!input->key_length) return VQS_OK;
    static const char hex[] = "0123456789abcdef";
    char spec[68] = "x'";
    for (size_t index = 0; index < 32; index++) {
        spec[2 + index * 2] = hex[input->key[index] >> 4];
        spec[3 + index * 2] = hex[input->key[index] & 15];
    }
    spec[66] = '\'';
    int status = exsqlite3_key(reader->database, spec, 67);
    wipe(spec, sizeof(spec));
    return status == SQLITE_OK ? VQS_OK : VQS_KEY;
}
static int integrity_query(VqsReader *reader, int encrypted) {
    exsqlite3_stmt *statement = NULL;
    int status = VQS_INTEGRITY;
    const char *sql = encrypted ? "PRAGMA cipher_integrity_check" : "PRAGMA integrity_check";
    reader->ticks = 0;
    if (exsqlite3_prepare_v2(reader->database, sql, -1, &statement, NULL) != SQLITE_OK) goto done;
    int step = exsqlite3_step(statement);
    if (!encrypted) {
        if (step != SQLITE_ROW || exsqlite3_column_type(statement, 0) != SQLITE_TEXT ||
                exsqlite3_column_bytes(statement, 0) != 2) goto done;
        const unsigned char *message = exsqlite3_column_text(statement, 0);
        if (!message || memcmp(message, "ok", 2)) goto done;
        step = exsqlite3_step(statement);
    }
    if (step == SQLITE_DONE) status = VQS_OK;
done:
    if (exsqlite3_finalize(statement) != SQLITE_OK) status = VQS_INTEGRITY;
    return status;
}
static int validate_database(VqsReader *reader, int encrypted) {
    sqlite3_int64 tables, page_size = 4096, page_count;
    /* SQLCipher 4.7 returns a TEXT cipher_page_size for encrypted handles;
     * unencrypted SQLite returns an INTEGER page_size. Do not coerce either. */
    int size_status = encrypted ? text_result_matches(reader->database, "PRAGMA cipher_page_size", "4096") :
            integer_result(reader->database, "PRAGMA page_size", &page_size);
    if (cipher_version(reader->database) ||
            integer_result(reader->database, "SELECT count(*) FROM sqlite_master", &tables) ||
            size_status ||
            integer_result(reader->database, "PRAGMA page_count", &page_count)) return VQS_OPEN;
    if (page_size < 512 || page_size > 65536 || (page_size & (page_size - 1)) ||
            page_count <= 0 || (uint64_t)page_count != reader->length / (uint64_t)page_size ||
            reader->length % (size_t)page_size) return VQS_INPUT;
    if (encrypted && text_result_matches(reader->database, "PRAGMA cipher_use_hmac", "1")) return VQS_ENGINE;
    if (encrypted && integrity_query(reader, 1)) return VQS_INTEGRITY;
    return integrity_query(reader, 0);
}

static int open_snapshot(const VqsInput *input, VqsReader **out) {
    if (!out) return VQS_INPUT;
    *out = NULL;
    if (!input || !input->bytes || input->length < 512 || input->length > SNAPSHOT_LIMIT) return VQS_INPUT;
    if ((input->key_length && (input->key_length != 32 || !input->key)) ||
            (input->key_length == 0 && memcmp(input->bytes, "SQLite format 3\0", 16)) ||
            (input->key_length && !memcmp(input->bytes, "SQLite format 3\0", 16))) return VQS_KEY;
    if (pthread_once(&engine_once, initialize_engine) || engine_status != SQLITE_OK) return VQS_ENGINE;
    VqsReader *reader = calloc(1, sizeof(*reader));
    if (!reader) return VQS_MEMORY;
    reader->bytes = malloc(input->length);
    if (!reader->bytes) { free(reader); return VQS_MEMORY; }
    reader->length = input->length;
    memcpy(reader->bytes, input->bytes, input->length);
    initialize_vfs(reader);
    int status = VQS_ENGINE;
    if (exsqlite3_vfs_register(&reader->vfs, 0) != SQLITE_OK) goto failure;
    reader->registered = 1;
    status = VQS_OPEN;
    if (exsqlite3_open_v2("file:" SNAPSHOT_PATH "?mode=ro&immutable=1", &reader->database,
            SQLITE_OPEN_READONLY | SQLITE_OPEN_URI | SQLITE_OPEN_PRIVATECACHE | SQLITE_OPEN_FULLMUTEX,
            reader->vfs_name) != SQLITE_OK) goto failure;
    if (exsqlite3_db_readonly(reader->database, "main") != 1) goto failure;
    status = keyed(reader, input);
    if (status) goto failure;
    status = execute(reader->database, "PRAGMA cipher_memory_security=ON; PRAGMA query_only=ON; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-4096; PRAGMA mmap_size=0");
    if (status) goto failure;
    exsqlite3_limit(reader->database, SQLITE_LIMIT_LENGTH, 1048576);
    exsqlite3_limit(reader->database, SQLITE_LIMIT_SQL_LENGTH, 24576);
    exsqlite3_limit(reader->database, SQLITE_LIMIT_COLUMN, 256);
    exsqlite3_progress_handler(reader->database, 1000, progress, reader);
    status = validate_database(reader, input->key_length != 0);
    if (status) goto failure;
    if (exsqlite3_db_config(reader->database, SQLITE_DBCONFIG_TRUSTED_SCHEMA, 0, NULL) != SQLITE_OK ||
            exsqlite3_set_authorizer(reader->database, authorize, reader) != SQLITE_OK) { status = VQS_ENGINE; goto failure; }
    *out = reader;
    return VQS_OK;
failure:
    vqs_close(reader);
    return status;
}

static int close_snapshot(VqsReader *reader) {
    if (!reader) return VQS_INPUT;
    if (reader->active_visits) return VQS_BUSY;
    if (reader->database && exsqlite3_close(reader->database) != SQLITE_OK) return VQS_BUSY;
    if (reader->registered) exsqlite3_vfs_unregister(&reader->vfs);
    wipe(reader->bytes, reader->length);
#ifdef VQS_TEST
    if (before_free) before_free(reader->bytes, reader->length);
#endif
    free(reader->bytes);
    wipe(reader, sizeof(*reader));
    free(reader);
    return VQS_OK;
}
static const char *query_sql(enum VqsQuery query) {
    switch (query) {
        case VQS_SCHEMA: return "SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name";
        case VQS_MIGRATIONS: return "SELECT version FROM schema_migrations ORDER BY version";
        case VQS_BATCH: return "SELECT id,revision,payload FROM voice_batch_operations ORDER BY id";
        case VQS_SINGLETON: return "SELECT id,attempt_id,revision,payload FROM voice_operation_journal ORDER BY id";
        case VQS_LEGACY: return "SELECT key,value FROM catalystLocalStorage WHERE key LIKE 'masarifi.voice.pending.%' ORDER BY key";
        case VQS_USER_VERSION: return "PRAGMA user_version";
        default: return NULL;
    }
}
static int visit_row(exsqlite3_stmt *statement, VqsVisitor visitor, void *context) {
    VqsCell cells[4] = {{0}};
    int columns = exsqlite3_column_count(statement);
    if (columns < 1 || columns > 4) return VQS_QUERY;
    for (int index = 0; index < columns; index++) {
        cells[index].kind = exsqlite3_column_type(statement, index);
        if (cells[index].kind == SQLITE_INTEGER) cells[index].integer = exsqlite3_column_int64(statement, index);
        else if (cells[index].kind == SQLITE_TEXT) {
            cells[index].text = exsqlite3_column_text(statement, index);
            int length = exsqlite3_column_bytes(statement, index);
            if (!cells[index].text || length < 0) return VQS_MEMORY;
            if (length > (int)COLUMN_LIMIT) return VQS_LIMIT;
            cells[index].length = (size_t)length;
        }
    }
    VqsRow row = {(size_t)columns, cells};
    return visitor(context, &row) ? VQS_VISITOR : VQS_OK;
}
static int visit_snapshot(VqsReader *reader, enum VqsQuery query, VqsVisitor visitor, void *context) {
    if (!reader || !visitor) return VQS_INPUT;
    if (reader->active_visits) return VQS_BUSY;
    const char *sql = query_sql(query);
    if (!sql) return VQS_QUERY;
    reader->active_visits = 1;
    reader->ticks = 0;
    exsqlite3_stmt *statement = NULL;
    int status = VQS_QUERY;
    if (exsqlite3_prepare_v2(reader->database, sql, -1, &statement, NULL) != SQLITE_OK) goto done;
    if (!exsqlite3_stmt_readonly(statement)) goto done;
    size_t rows = 0, total = 0;
    int step;
    while ((step = exsqlite3_step(statement)) == SQLITE_ROW) {
        if (++rows > ROW_LIMIT) { status = VQS_LIMIT; goto done; }
        for (int column = 0; column < exsqlite3_column_count(statement); column++) {
            int kind = exsqlite3_column_type(statement, column);
            if (kind != SQLITE_TEXT && kind != SQLITE_BLOB) continue;
            int length = exsqlite3_column_bytes(statement, column);
            if (length < 0 || (size_t)length > 4u * 1024u * 1024u - total) { status = VQS_LIMIT; goto done; }
            total += (size_t)length;
        }
        status = visit_row(statement, visitor, context);
        if (status) goto done;
    }
    status = step == SQLITE_DONE ? VQS_OK : step == SQLITE_INTERRUPT ? VQS_LIMIT : VQS_QUERY;
done:
    if (exsqlite3_finalize(statement) != SQLITE_OK && status == VQS_OK) status = VQS_QUERY;
    reader->active_visits = 0;
    return status;
}
static int snapshot_stats(const VqsReader *reader, VqsStats *out) {
    if (!reader || !out) return VQS_INPUT;
    *out = reader->counters;
    return VQS_OK;
}

/* SQLCipher 4.7 also has process-global allocator/security flags. A connection's
 * FULLMUTEX does not protect those flags. Diagnostic entries share this gate;
 * recursion allows a visitor's close attempt to return BUSY without deadlock. */
static int enter_engine(void) {
    if (mutex_init() != SQLITE_OK) return VQS_ENGINE;
    mutex_enter((exsqlite3_mutex *)&engine_gate);
    return VQS_OK;
}
int vqs_open(const VqsInput *input, VqsReader **out) {
    if (!out) return VQS_INPUT;
    *out = NULL;
    if (enter_engine()) return VQS_ENGINE;
    int status = open_snapshot(input, out);
    mutex_leave((exsqlite3_mutex *)&engine_gate);
    return status;
}
int vqs_close(VqsReader *reader) {
    if (enter_engine()) return VQS_ENGINE;
    int status = close_snapshot(reader);
    mutex_leave((exsqlite3_mutex *)&engine_gate);
    return status;
}
int vqs_visit(VqsReader *reader, enum VqsQuery query, VqsVisitor visitor, void *context) {
    if (enter_engine()) return VQS_ENGINE;
    int status = visit_snapshot(reader, query, visitor, context);
    mutex_leave((exsqlite3_mutex *)&engine_gate);
    return status;
}
int vqs_stats(const VqsReader *reader, VqsStats *out) {
    if (enter_engine()) return VQS_ENGINE;
    int status = snapshot_stats(reader, out);
    mutex_leave((exsqlite3_mutex *)&engine_gate);
    return status;
}
const char *vqs_error_name(int status) {
    static const char *names[] = {"OK", "SNAPSHOT_INPUT", "SNAPSHOT_KEY", "SNAPSHOT_ENGINE", "SNAPSHOT_MEMORY",
        "SNAPSHOT_OPEN", "SNAPSHOT_INTEGRITY", "SNAPSHOT_QUERY", "SNAPSHOT_LIMIT", "SNAPSHOT_VISITOR", "SNAPSHOT_BUSY"};
    return status >= 0 && status <= VQS_BUSY ? names[status] : "SNAPSHOT_UNKNOWN";
}

#ifdef VQS_TEST
/* Test hooks observe actual I/O/memory effects. Never compile/package them in the probe. */
VQS_EXPORT int vqs_test_sql(VqsReader *reader, const char *sql) { return exsqlite3_exec(reader->database, sql, NULL, NULL, NULL); }
static exsqlite3_file *test_file(VqsReader *reader) {
    exsqlite3_file *file = NULL;
    if (exsqlite3_file_control(reader->database, "main", SQLITE_FCNTL_FILE_POINTER, &file) != SQLITE_OK) return NULL;
    return file;
}
VQS_EXPORT int vqs_test_read(VqsReader *reader, unsigned char *output, int amount, int64_t offset) {
    exsqlite3_file *file = test_file(reader);
    return file ? file->pMethods->xRead(file, output, amount, offset) : SQLITE_ERROR;
}
VQS_EXPORT int vqs_test_write(VqsReader *reader) {
    exsqlite3_file *file = test_file(reader);
    return file ? file->pMethods->xWrite(file, "X", 1, 0) : SQLITE_ERROR;
}
VQS_EXPORT int vqs_test_external_open(VqsReader *reader) {
    MemoryFile file = {0};
    return reader->vfs.xOpen(&reader->vfs, "/not-a-snapshot", &file.base, SQLITE_OPEN_READONLY | SQLITE_OPEN_MAIN_DB, NULL);
}
VQS_EXPORT int vqs_test_delete(VqsReader *reader) { return reader->vfs.xDelete(&reader->vfs, "/not-a-snapshot", 0); }
VQS_EXPORT void vqs_test_before_free(void (*observer)(const unsigned char *, size_t)) { before_free = observer; }
#endif
