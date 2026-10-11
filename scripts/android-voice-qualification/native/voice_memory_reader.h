#ifndef MASARIFI_VOICE_MEMORY_READER_H
#define MASARIFI_VOICE_MEMORY_READER_H

#include <stddef.h>
#include <stdint.h>

#if defined(__GNUC__)
#define VQS_EXPORT __attribute__((visibility("default")))
#else
#define VQS_EXPORT
#endif

/* Ownership is native and exclusive. No path, SQL or app handle is an input. */
typedef struct VqsReader VqsReader;
typedef struct {
    const unsigned char *bytes;
    size_t length;
    const unsigned char *key;
    size_t key_length;
} VqsInput;
typedef struct {
    int kind;
    size_t length;
    const unsigned char *text;
    int64_t integer;
} VqsCell;
typedef struct { size_t count; const VqsCell *cells; } VqsRow;
typedef int (*VqsVisitor)(void *, const VqsRow *);
typedef struct {
    uint64_t reads, bytes_read, denied_writes, denied_opens, denied_deletes;
} VqsStats;

enum VqsStatus {
    VQS_OK, VQS_INPUT, VQS_KEY, VQS_ENGINE, VQS_MEMORY, VQS_OPEN,
    VQS_INTEGRITY, VQS_QUERY, VQS_LIMIT, VQS_VISITOR, VQS_BUSY
};
enum VqsQuery { VQS_SCHEMA, VQS_MIGRATIONS, VQS_BATCH, VQS_SINGLETON, VQS_LEGACY };

VQS_EXPORT int vqs_open(const VqsInput *, VqsReader **);
VQS_EXPORT int vqs_close(VqsReader *);
/* Row pointers are borrowed until callback return; callback failure is indeterminate. */
VQS_EXPORT int vqs_visit(VqsReader *, enum VqsQuery, VqsVisitor, void *);
VQS_EXPORT int vqs_stats(const VqsReader *, VqsStats *);
VQS_EXPORT const char *vqs_error_name(int);

#endif
