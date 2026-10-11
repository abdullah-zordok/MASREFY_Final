package com.masarifi.voicequalification;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Full sqlite_master coverage, derived from exact91213b4/7967007 migrations.
 * Recognition alone does not establish journal emptiness or owner/key coverage. */
public final class VoiceDatabaseSchema {
    public record SchemaObject(String type,String name,String table,String sql) {}
    public record Coverage(int version,boolean singleton,boolean batch,boolean asyncStorage,boolean migrationMarker) {}
    private static final String MARKER = "_masarifi_migration_state";
    private static final SchemaObject MARKER_TABLE = new SchemaObject("table",MARKER,MARKER,
            "CREATE TABLE _masarifi_migration_state (\n        key TEXT PRIMARY KEY NOT NULL,\n        value TEXT NOT NULL\n      )");
    private static final SchemaObject MARKER_INDEX = new SchemaObject("index","sqlite_autoindex__masarifi_migration_state_1",MARKER,null);
    private static final SchemaObject METADATA = new SchemaObject("table","android_metadata","android_metadata",
            "CREATE TABLE android_metadata (locale TEXT)");
    private static final String ASYNC = "f940a2eb6de1cfecaafe73802f1f4d942e630ef5040b1ccc6a35d79388015062";
    private static final String[] PREFIXES = {
        "", "c9983277b541639cffd1a24e2bad40e242dd05aba1b0c46c16bee3aa4243b985",
        "e390f3cf7499e6f999177804eaa0eac2e20f6ac6ac0b50df9bcaa045250738d1",
        "f6e7fa18112bccc65c09c2899da1a83bd7416033f0182ebbb0bab10c81161226",
        "92c10c3945bbdfdc5a0b302ac8b507839195c6d54c8399cd488d890f9f28780b",
        "4b2364e944bd8e3ac2c10c7dc09dd071bfe0807a00fd84bb9d6dbd999714142d",
        "9238084e9c65aeaa3a057d326cdd6df94a9cbe76d1054f65c64128ad64fffd68",
        "92c318e8ba17477d73f54eb9fdaaf220af49afb16f1090558aced04e84dfd995",
        "5d2bdd53dce16cc34786c58731189e46d921f9981d1d6b93ee8f0660d0ba2374",
        "3e3b4a3fe88dd9303c825726893e6f9fba79173fbc1baf30b27f2d976713cccd",
        "b6e9cb10f39cb1d850b0ed698704c72acd1fa7665f0ef09bd4493f6eafd514e8",
        "b6e9cb10f39cb1d850b0ed698704c72acd1fa7665f0ef09bd4493f6eafd514e8",
        "48cc3aef4485b34373d62f6e884b34c599c65201636e1dba4a0588c79edab125",
        "ea12785792ba64c65e1a9cf04ab1a7eb8562f469ed4217140436c9f396e47a23",
        "7ff145f8513c0ded95a64742def0c1fad20304125f52f3ba101b3f04bad27fad",
        "202e7519631c026bf75e8ca1479dc40097b405b44d483ed92e393f335919b274"
    };

    static Coverage mobile(List<SchemaObject> objects,List<Long> versions) {
        int version = prefixVersion(versions);
        List<SchemaObject> checked = validated(objects);
        boolean marker = removeMarker(checked);
        checked.remove(METADATA);
        if (!signature(checked).equals(PREFIXES[version])) throw failure("SCHEMA_UNKNOWN");
        return new Coverage(version,version>=14,version>=15,false,marker);
    }
    static Coverage async(List<SchemaObject> objects,long userVersion) {
        if (userVersion != 1) throw failure("SCHEMA_ASYNC_VERSION");
        List<SchemaObject> checked = validated(objects);
        checked.remove(METADATA);
        if (!signature(checked).equals(ASYNC)) throw failure("SCHEMA_UNKNOWN");
        return new Coverage(1,false,false,true,false);
    }
    private static int prefixVersion(List<Long> versions) {
        if (versions == null || versions.isEmpty() || versions.size()>15) throw failure("SCHEMA_MIGRATIONS");
        for (int index=0;index<versions.size();index++)
            if (versions.get(index) == null || versions.get(index) != index+1L) throw failure("SCHEMA_MIGRATIONS");
        return versions.size();
    }
    private static List<SchemaObject> validated(List<SchemaObject> objects) {
        if (objects == null || objects.isEmpty() || objects.size()>256) throw failure("SCHEMA_LIMIT");
        List<SchemaObject> checked = new ArrayList<>(objects);
        Set<String> identities = new HashSet<>();
        for (SchemaObject row : checked) {
            if (row == null || row.type == null || !Set.of("table","index","view","trigger").contains(row.type)) throw failure("SCHEMA_OBJECT");
            identifier(row.name);
            identifier(row.table);
            if (row.sql != null && (row.sql.length()>24576 || row.sql.indexOf(0)>=0)) throw failure("SCHEMA_LIMIT");
            if (!identities.add(row.type+"/"+row.name)) throw failure("SCHEMA_DUPLICATE");
        }
        checked.sort(Comparator.comparing(SchemaObject::type).thenComparing(SchemaObject::name));
        return checked;
    }
    private static boolean removeMarker(List<SchemaObject> objects) {
        boolean table = objects.remove(MARKER_TABLE);
        boolean index = objects.remove(MARKER_INDEX);
        if (table != index) throw failure("SCHEMA_MARKER");
        return table;
    }
    private static String signature(List<SchemaObject> objects) {
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException unavailable) { throw failure("SCHEMA_HASH"); }
        digest.update("VQS_SCHEMA_V1\0".getBytes(StandardCharsets.UTF_8));
        for (SchemaObject row : objects)
            for (String field : new String[]{row.type,row.name,row.table,row.sql}) update(digest,field);
        StringBuilder hex = new StringBuilder(64);
        for (byte octet : digest.digest()) hex.append(String.format(java.util.Locale.ROOT,"%02x",octet & 255));
        return hex.toString();
    }
    private static void update(MessageDigest digest,String field) {
        byte[] bytes = field == null ? null : field.getBytes(StandardCharsets.UTF_8);
        digest.update(ByteBuffer.allocate(4).putInt(bytes == null ? -1 : bytes.length).array());
        if (bytes != null) digest.update(bytes);
    }
    private static void identifier(String text) {
        if (text == null || !text.matches("[a-zA-Z_][a-zA-Z_0-9]{0,255}")) throw failure("SCHEMA_IDENTIFIER");
    }
    private static IllegalStateException failure(String code) { return new IllegalStateException(code); }
}
