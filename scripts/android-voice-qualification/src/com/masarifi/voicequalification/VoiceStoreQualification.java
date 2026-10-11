package com.masarifi.voicequalification;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Binds complete stable inventory, existing-only keys, committed pages and strict row semantics.
 * A CLEAR receipt is valid only for an independently quiesced package and qualified reader. */
public final class VoiceStoreQualification {
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
        if(snapshot==null || factory==null)throw failure("STORE_INPUT");
        try {
            if(!snapshot.verifyUnchanged())throw failure("STATE_CHANGED");
            var index=SecureStoreKeyIndex.combine(snapshot.content("shared_prefs/SecureStore.xml"),
                    snapshot.content("shared_prefs/com.masarifi.mobile_preferences.xml"));
            Set<String> hashes=index.ownerHashes(), stores=new HashSet<>();
            for(String name:snapshot.names()) if(name.matches("files/SQLite/masarifi-[a-f0-9]{24}\\.db"))stores.add(name);
            if(stores.isEmpty())throw failure("STORE_COVERAGE_MISSING");
            for(String hash:hashes) if(!stores.contains(ROOT+"masarifi-"+hash.substring(0,24)+".db"))throw failure("KEY_STORE_WITHOUT_DATABASE");
            if(hashes.size()!=stores.size())throw failure("KEY_MISSING");
            String claimedOwner=claim(index,keys);
            Set<String> markedOwners=new HashSet<>();
            Counts counts=new Counts();
            // Never stop at the first blocking row: every owner must still be recognized.
            for(String hash:hashes.stream().sorted().toList()) {
                String name=ROOT+"masarifi-"+hash.substring(0,24)+".db";
                rejectRollback(snapshot,name);
                try(var key=ExistingDatabaseKey.decrypt(index.owner(hash.substring(0,24)),keys);
                    var committed=CommittedWalSnapshot.reconstruct(snapshot.content(name),snapshot.content(name+"-wal"));
                    var reader=factory.open(committed.bytes(),key.bytes())) {
                    counts.frames+=committed.committedFrames();
                    if(mobile(reader,hash,counts))markedOwners.add(hash);
                    counts.owners++;
                }
            }
            if(!markedOwners.isEmpty() && (claimedOwner==null || markedOwners.size()!=1 || !markedOwners.contains(claimedOwner)))
                throw failure("LEGACY_OWNER_BINDING");
            if(claimedOwner!=null && !markedOwners.contains(claimedOwner))throw failure("LEGACY_MIGRATION_INCOMPLETE");
            if(snapshot.content(LEGACY)!=null) {
                if(claimedOwner==null || !hashes.contains(claimedOwner) || !markedOwners.contains(claimedOwner))
                    throw failure("LEGACY_MIGRATION_INCOMPLETE");
                rejectRollback(snapshot,LEGACY);
                try(var committed=CommittedWalSnapshot.reconstruct(snapshot.content(LEGACY),snapshot.content(LEGACY+"-wal"));
                    var reader=factory.open(committed.bytes(),null)) {
                    counts.frames+=committed.committedFrames();
                    if(mobile(reader,null,counts))throw failure("LEGACY_MARKER_UNEXPECTED");
                    counts.legacy++;
                }
            }
            if(snapshot.content(ASYNC)!=null) {
                rejectRollback(snapshot,ASYNC);
                try(var committed=CommittedWalSnapshot.reconstruct(snapshot.content(ASYNC),snapshot.content(ASYNC+"-wal"));
                    var reader=factory.open(committed.bytes(),null)) {
                    counts.frames+=committed.committedFrames();
                    VoiceDatabaseSchema.async(schema(reader),userVersion(reader));
                    // Read every AsyncStorage row. A WHERE/LIKE prefix could silently
                    // drop malformed, binary or NUL-bearing Voice keys as a false zero.
                    each(reader,SnapshotReader.Query.LEGACY,2,row -> {
                        String key=text(row[0]),value=text(row[1]);
                        if(key.toLowerCase(java.util.Locale.ROOT).contains("masarifi.voice"))
                            counts.add(VoiceJournalClassifier.legacy(key,value));
                    });
                    counts.async++;
                }
            }
            if(!snapshot.verifyUnchanged())throw failure("STATE_CHANGED");
            return new Result(counts.pending+counts.audio+counts.confirmation==0?"CLEAR":"BLOCKED",counts.owners,counts.legacy,
                    counts.async,counts.rows,counts.pending,counts.terminal,counts.audio,counts.confirmation,counts.frames,
                    (String)snapshot.summary().get("fingerprint"));
        } catch(RuntimeException indeterminate) {
            // No provider/parser/SQL exception or private cause may cross this boundary.
            throw failure("STORE_INDETERMINATE");
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
    private static void rejectRollback(VoiceStoreSnapshot snapshot,String name) {
        // No pinned rollback-journal classifier exists. Even an empty persistent journal
        // cannot be silently treated as absent; never invoke SQLite recovery/checkpoint.
        if(snapshot.content(name+"-journal")!=null)throw failure("ROLLBACK_UNCLASSIFIED");
    }
    private static boolean mobile(SnapshotReader reader,String owner,Counts counts) {
        if(userVersion(reader)!=0)throw failure("SCHEMA_MOBILE_VERSION");
        List<Long> versions=new ArrayList<>();
        each(reader,SnapshotReader.Query.MIGRATIONS,1,row -> versions.add(integer(row[0])));
        var coverage=VoiceDatabaseSchema.mobile(schema(reader),versions);
        if(coverage.migrationMarker()) {
            int[] found={0};
            each(reader,SnapshotReader.Query.MARKER,2,row -> {
                if(++found[0]!=1 || !"legacy-export-owner".equals(text(row[0])) || owner==null || !owner.equals(text(row[1])))
                    throw failure("LEGACY_MARKER_BINDING");
            });
            if(found[0]!=1)throw failure("LEGACY_MARKER_BINDING");
        }
        if(coverage.batch())each(reader,SnapshotReader.Query.BATCH,3,row ->
                counts.add(VoiceJournalClassifier.batch(text(row[0]),integer(row[1]),text(row[2]))));
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
