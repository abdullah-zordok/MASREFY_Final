package com.masarifi.voicequalification;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Binds complete stable inventory, existing-only keys, committed pages and strict row semantics.
 * A CLEAR receipt is valid only for an independently quiesced package and qualified reader. */
public final class VoiceStoreQualification {
    enum Stage {INPUT,SNAPSHOT_STABILITY_BEFORE,SECURESTORE_INDEX,OWNER_DATABASE_INVENTORY,OWNER_DATABASE_REQUIRED,KEY_DATABASE_MATCH,KEY_COVERAGE,LEGACY_CLAIM,OWNER_ROLLBACK_CHECK,OWNER_KEY_DECRYPT,OWNER_WAL_RECONSTRUCT,OWNER_DATABASE_OPEN,MOBILE_USER_VERSION,MOBILE_MIGRATIONS,MOBILE_SCHEMA,MOBILE_MIGRATION_MARKER,MOBILE_BATCH_ROWS,MOBILE_SINGLETON_ROWS,OWNER_RESOURCES_CLOSE,LEGACY_OWNER_BINDING,LEGACY_MIGRATION_STATE,LEGACY_DATABASE_BINDING,LEGACY_ROLLBACK_CHECK,LEGACY_WAL_RECONSTRUCT,LEGACY_DATABASE_OPEN,LEGACY_MARKER_ABSENCE,LEGACY_RESOURCES_CLOSE,ASYNC_ROLLBACK_CHECK,ASYNC_WAL_RECONSTRUCT,ASYNC_DATABASE_OPEN,ASYNC_SCHEMA,ASYNC_ROWS,ASYNC_RESOURCES_CLOSE,SNAPSHOT_STABILITY_AFTER,RESULT}
    private static final class Progress {
        Stage stage=Stage.INPUT;
        <T> T at(Stage next,java.util.function.Supplier<T> operation) {stage=next;return operation.get();}
    }
    private static final class QualificationFailure extends IllegalStateException {
        final Stage stage;
        QualificationFailure(Stage stage) {super("STORE_INDETERMINATE",null);this.stage=stage;}
    }
    /** Only failures constructed inside this qualifier carry trusted stage metadata. */
    static Stage stageOf(Throwable failure) {
        return failure instanceof QualificationFailure qualified?qualified.stage:null;
    }
    private static final String ROOT = "files/SQLite/", LEGACY = ROOT+"masarifi.db", ASYNC = "databases/RKStorage";
    public record Result(String verdict, int ownerDatabases, int legacyDatabases, int asyncDatabases,
                         int rows, int pending, int terminal, int audioOwned, int confirmationOwned,
                         int committedFrames, String fingerprint) {}
    private static final class Counts {
        int owners,legacy,async,rows,pending,terminal,audio,confirmation,frames;
        void add(VoiceJournalClassifier.Assessment assessment) {
            if (++rows > 524288) throw failure("JOURNAL_LIMIT");
            if(assessment.pending())pending++;
            if(assessment.terminal())terminal++;
            if(assessment.audioOwned())audio++;
            if(assessment.confirmationOwned())confirmation++;
        }
    }

    static Result qualify(VoiceStoreSnapshot snapshot,ExistingDatabaseKey.ExistingKeySource keys,SnapshotReader.Factory factory) {
        Progress progress=new Progress();
        try {
            if(snapshot==null || factory==null)throw failure("STORE_INPUT");
            progress.stage=Stage.SNAPSHOT_STABILITY_BEFORE;
            if(!snapshot.verifyUnchanged())throw failure("STATE_CHANGED");
            progress.stage=Stage.SECURESTORE_INDEX;
            var index=SecureStoreKeyIndex.combine(snapshot.content("shared_prefs/SecureStore.xml"),
                    snapshot.content("shared_prefs/com.masarifi.mobile_preferences.xml"));
            progress.stage=Stage.OWNER_DATABASE_INVENTORY;
            Set<String> hashes=index.ownerHashes(), stores=new HashSet<>();
            for(String name:snapshot.names()) if(name.matches("files/SQLite/masarifi-[a-f0-9]{24}\\.db"))stores.add(name);
            progress.stage=Stage.OWNER_DATABASE_REQUIRED;
            if(stores.isEmpty())throw failure("STORE_COVERAGE_MISSING");
            progress.stage=Stage.KEY_DATABASE_MATCH;
            for(String hash:hashes) if(!stores.contains(ROOT+"masarifi-"+hash.substring(0,24)+".db"))throw failure("KEY_STORE_WITHOUT_DATABASE");
            progress.stage=Stage.KEY_COVERAGE;
            if(hashes.size()!=stores.size())throw failure("KEY_MISSING");
            progress.stage=Stage.LEGACY_CLAIM;
            String claimedOwner=claim(index,keys);
            Set<String> markedOwners=new HashSet<>();
            Counts counts=new Counts();
            // Never stop at the first blocking row: every owner must still be recognized.
            for(String hash:hashes.stream().sorted().toList()) {
                String name=ROOT+"masarifi-"+hash.substring(0,24)+".db";
                progress.stage=Stage.OWNER_ROLLBACK_CHECK;requireInactiveRollback(snapshot,name);
                try(var key=progress.at(Stage.OWNER_KEY_DECRYPT,()->ExistingDatabaseKey.decrypt(index.owner(hash.substring(0,24)),keys));
                    var committed=progress.at(Stage.OWNER_WAL_RECONSTRUCT,()->CommittedWalSnapshot.reconstruct(snapshot.content(name),snapshot.content(name+"-wal")));
                    var reader=progress.at(Stage.OWNER_DATABASE_OPEN,()->factory.open(committed.bytes(),key.bytes()))) {
                    counts.frames+=committed.committedFrames();
                    if(mobile(reader,hash,counts,progress))markedOwners.add(hash);
                    counts.owners++;progress.stage=Stage.OWNER_RESOURCES_CLOSE;
                }
            }
            progress.stage=Stage.LEGACY_OWNER_BINDING;
            if(!markedOwners.isEmpty() && (claimedOwner==null || markedOwners.size()!=1 || !markedOwners.contains(claimedOwner)))
                throw failure("LEGACY_OWNER_BINDING");
            progress.stage=Stage.LEGACY_MIGRATION_STATE;
            if(claimedOwner!=null && !markedOwners.contains(claimedOwner))throw failure("LEGACY_MIGRATION_INCOMPLETE");
            if(snapshot.content(LEGACY)!=null) {
                progress.stage=Stage.LEGACY_DATABASE_BINDING;
                if(claimedOwner==null || !hashes.contains(claimedOwner) || !markedOwners.contains(claimedOwner))
                    throw failure("LEGACY_MIGRATION_INCOMPLETE");
                progress.stage=Stage.LEGACY_ROLLBACK_CHECK;requireInactiveRollback(snapshot,LEGACY);
                try(var committed=progress.at(Stage.LEGACY_WAL_RECONSTRUCT,()->CommittedWalSnapshot.reconstruct(snapshot.content(LEGACY),snapshot.content(LEGACY+"-wal")));
                    var reader=progress.at(Stage.LEGACY_DATABASE_OPEN,()->factory.open(committed.bytes(),null))) {
                    counts.frames+=committed.committedFrames();
                    boolean marked=mobile(reader,null,counts,progress);
                    progress.stage=Stage.LEGACY_MARKER_ABSENCE;if(marked)throw failure("LEGACY_MARKER_UNEXPECTED");
                    counts.legacy++;progress.stage=Stage.LEGACY_RESOURCES_CLOSE;
                }
            }
            if(snapshot.content(ASYNC)!=null) {
                progress.stage=Stage.ASYNC_ROLLBACK_CHECK;requireInactiveRollback(snapshot,ASYNC);
                try(var committed=progress.at(Stage.ASYNC_WAL_RECONSTRUCT,()->CommittedWalSnapshot.reconstruct(snapshot.content(ASYNC),snapshot.content(ASYNC+"-wal")));
                    var reader=progress.at(Stage.ASYNC_DATABASE_OPEN,()->factory.open(committed.bytes(),null))) {
                    counts.frames+=committed.committedFrames();
                    progress.stage=Stage.ASYNC_SCHEMA;VoiceDatabaseSchema.async(schema(reader),userVersion(reader));
                    // Read every AsyncStorage row. A WHERE/LIKE prefix could silently
                    // drop malformed, binary or NUL-bearing Voice keys as a false zero.
                    progress.stage=Stage.ASYNC_ROWS;
                    each(reader,SnapshotReader.Query.LEGACY,2,row -> {
                        String key=text(row[0]),value=text(row[1]);
                        if(key.toLowerCase(java.util.Locale.ROOT).contains("masarifi.voice"))
                            counts.add(VoiceJournalClassifier.legacy(key,value));
                    });
                    counts.async++;progress.stage=Stage.ASYNC_RESOURCES_CLOSE;
                }
            }
            progress.stage=Stage.SNAPSHOT_STABILITY_AFTER;
            if(!snapshot.verifyUnchanged())throw failure("STATE_CHANGED");
            progress.stage=Stage.RESULT;
            return new Result(counts.pending+counts.audio+counts.confirmation==0?"CLEAR":"BLOCKED",counts.owners,counts.legacy,
                    counts.async,counts.rows,counts.pending,counts.terminal,counts.audio,counts.confirmation,counts.frames,
                    (String)snapshot.summary().get("fingerprint"));
        } catch(RuntimeException | LinkageError indeterminate) {
            // No provider/parser/SQL exception or private cause may cross this boundary.
            throw new QualificationFailure(progress.stage);
        }
    }
    private static String claim(SecureStoreKeyIndex index,ExistingDatabaseKey.ExistingKeySource keys) {
        var envelope=index.legacyOwner();if(envelope==null)return null;
        try(var value=ExistingDatabaseKey.decryptOwnerHash(envelope,keys)) {
            StringBuilder hash=new StringBuilder(64);
            for(byte octet:value.bytes())hash.append(String.format(java.util.Locale.ROOT,"%02x",octet&255));
            return hash.toString();
        }
    }
    private static void requireInactiveRollback(VoiceStoreSnapshot snapshot,String name) {
        // Pinned sqlite3.c zeroJournalHdr commits by truncating to zero bytes or
        // zeroing all 28 header bytes. Accept only those complete inactive forms,
        // not SQLite's broader first-byte heuristic. Tail pages are stale, not replayed.
        // The package must stay quiescent and the complete snapshot unchanged.
        byte[] journal=snapshot.content(name+"-journal");
        if(journal==null || journal.length==0)return;
        if(journal.length<28)throw failure("ROLLBACK_UNCLASSIFIED");
        for(int index=0;index<28;index++)
            if(journal[index]!=0)throw failure("ROLLBACK_UNCLASSIFIED");
    }
    private static boolean mobile(SnapshotReader reader,String owner,Counts counts,Progress progress) {
        progress.stage=Stage.MOBILE_USER_VERSION;
        if(userVersion(reader)!=0)throw failure("SCHEMA_MOBILE_VERSION");
        progress.stage=Stage.MOBILE_MIGRATIONS;
        List<Long> versions=new ArrayList<>();
        each(reader,SnapshotReader.Query.MIGRATIONS,1,row -> versions.add(integer(row[0])));
        progress.stage=Stage.MOBILE_SCHEMA;
        var coverage=VoiceDatabaseSchema.mobile(schema(reader),versions);
        if(coverage.migrationMarker()) {
            progress.stage=Stage.MOBILE_MIGRATION_MARKER;
            int[] found={0};
            each(reader,SnapshotReader.Query.MARKER,2,row -> {
                if(++found[0]!=1 || !"legacy-export-owner".equals(text(row[0])) || owner==null || !owner.equals(text(row[1])))
                    throw failure("LEGACY_MARKER_BINDING");
            });
            if(found[0]!=1)throw failure("LEGACY_MARKER_BINDING");
        }
        progress.stage=Stage.MOBILE_BATCH_ROWS;
        if(coverage.batch())each(reader,SnapshotReader.Query.BATCH,3,row ->
                counts.add(VoiceJournalClassifier.batch(text(row[0]),integer(row[1]),text(row[2]))));
        progress.stage=Stage.MOBILE_SINGLETON_ROWS;
        if(coverage.singleton())each(reader,SnapshotReader.Query.SINGLETON,4,row ->
                counts.add(VoiceJournalClassifier.singleton(text(row[0]),text(row[1]),integer(row[2]),text(row[3]))));
        return coverage.migrationMarker();
    }
    private static List<VoiceDatabaseSchema.SchemaObject> schema(SnapshotReader reader) {
        var objects=new ArrayList<VoiceDatabaseSchema.SchemaObject>();
        each(reader,SnapshotReader.Query.SCHEMA,4,row -> objects.add(new VoiceDatabaseSchema.SchemaObject(
                text(row[0]),text(row[1]),text(row[2]),row[3]==null?null:text(row[3]))));
        return objects;
    }
    private static long userVersion(SnapshotReader reader) {
        List<Long> versions=new ArrayList<>();each(reader,SnapshotReader.Query.USER_VERSION,1,row -> versions.add(integer(row[0])));
        if(versions.size()!=1)throw failure("SCHEMA_HEADER");return versions.get(0);
    }
    private static void each(SnapshotReader reader,SnapshotReader.Query query,int columns,java.util.function.Consumer<Object[]> visitor) {
        int[] rows={0};
        reader.visit(query,row -> {if(row==null || row.length!=columns || ++rows[0]>1024)throw failure("JOURNAL_ROWS");visitor.accept(row);});
    }
    private static String text(Object value) {if(!(value instanceof String text))throw failure("JOURNAL_COLUMN");return text;}
    private static long integer(Object value) {if(!(value instanceof Long number))throw failure("JOURNAL_COLUMN");return number;}
    private static IllegalStateException failure(String code) {return new IllegalStateException(code);}
}
