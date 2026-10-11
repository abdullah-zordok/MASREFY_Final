package com.masarifi.voicequalification;

import java.lang.reflect.InvocationTargetException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/** Actual public migration fixtures; no application database or key is accepted. */
public final class VoiceDatabaseSchemaTest {
    private static Class<?> schema;
    private static Class<?> rowType;
    private static int checks;
    public static void main(String[] arguments) throws Exception {
        try { schema = Class.forName("com.masarifi.voicequalification.VoiceDatabaseSchema"); }
        catch (ClassNotFoundException missing) { throw new AssertionError("full schema validation is not implemented",missing); }
        rowType = Class.forName("com.masarifi.voicequalification.VoiceDatabaseSchema$SchemaObject");
        Path root = Path.of(arguments[0]);
        for (int version=1;version<=15;version++) {
            for (String prefix : new String[]{"prefix-","marked-","metadata-"}) {
                List<Object> rows = rows(root.resolve(prefix+version+".rows"));
                List<Long> versions = versions(version);
                Object coverage = mobile(rows,versions);
                checked(integer(coverage,"version") == version,"exact known schema prefix accepted");
                checked(flag(coverage,"singleton") == (version>=14) && flag(coverage,"batch") == (version>=15),"Voice tables bound to schema version");
                checked(flag(coverage,"migrationMarker") == !prefix.equals("prefix-"),"migration marker identified");
                List<Object> missing = new ArrayList<>(rows);
                missing.remove(0);
                reject(missing,versions);
            }
        }
        List<Object> latest = rows(root.resolve("prefix-15.rows"));
        // Null/type/identity/SQL bounds and partial optional objects must fail closed.
        for (Object malformed : new Object[]{
                row(null,"unknown","unknown",null), row("other","unknown","unknown",null),
                row("table",null,"unknown",null), row("table","unknown",null,null),
                row("table","bad-name","unknown",null),
                row("table","unknown","unknown","x".repeat(24577)),
                row("table","unknown","unknown","x\0y")}) {
            List<Object> invalid = new ArrayList<>(latest);
            invalid.add(malformed);
            reject(invalid,versions(15));
        }
        List<Object> invalid = new ArrayList<>(latest);
        invalid.add(null);
        reject(invalid,versions(15));
        reject(null,versions(15));
        reject(latest,null);
        List<Long> nullVersion = versions(15);
        nullVersion.set(3,null);
        reject(latest,nullVersion);
        for (String missingType : new String[]{"table","index"}) {
            invalid = new ArrayList<>();
            for (Object object : rows(root.resolve("marked-15.rows")))
                if (!text(object,"table").equals("_masarifi_migration_state") || !text(object,"type").equals(missingType)) invalid.add(object);
            reject(invalid,versions(15));
        }
        invalid = new ArrayList<>(latest);
        invalid.add(row("table","android_metadata","android_metadata","CREATE TABLE android_metadata (locale TEXT, payload TEXT)"));
        reject(invalid,versions(15));
        reject(latest,List.of());
        reject(latest,List.of(14L,15L));
        reject(latest,List.of(1L,1L));
        reject(latest,versions(14));
        reject(latest,versions(16));
        List<Object> altered = new ArrayList<>(latest);
        altered.add(row("table","unrecognized","unrecognized","CREATE TABLE unrecognized(payload TEXT)"));
        reject(altered,versions(15));
        altered = new ArrayList<>(latest);
        altered.add(latest.get(0));
        reject(altered,versions(15));
        for (String name : new String[]{"voice_batch_operations","voice_operation_journal","schema_migrations","finance_accounts"}) {
            altered = new ArrayList<>();
            for (Object object : latest) if (!text(object,"table").equals(name)) altered.add(object);
            reject(altered,versions(15));
        }
        for (String type : new String[]{"view","trigger"}) {
            altered = new ArrayList<>(latest);
            altered.add(row(type,"unexpected","voice_batch_operations","synthetic secret SQL"));
            reject(altered,versions(15));
        }
        for (String prefix : new String[]{"async","async-meta"}) {
            Object coverage = schema.getDeclaredMethod("async",List.class,long.class).invoke(null,rows(root.resolve(prefix+".rows")),1L);
            checked(flag(coverage,"asyncStorage") && !flag(coverage,"singleton") && !flag(coverage,"batch"),"known AsyncStorage schema accepted");
        }
        rejectAsync(rows(root.resolve("async.rows")),0);
        rejectAsync(rows(root.resolve("async.rows")),2);
        rejectAsync(latest,1);
        reject(rows(root.resolve("async.rows")),versions(15));
        reject(List.of(),List.of());
        checked(!mobile(latest,versions(15)).toString().contains("voice_"),"coverage contains no private schema text");
        System.out.println("PASS: "+checks+" real-migration schema coverage checks; fixtures retained");
    }
    private static List<Object> rows(Path path) throws Exception {
        List<Object> rows = new ArrayList<>();
        for (String line : Files.readAllLines(path,StandardCharsets.UTF_8)) {
            String[] fields = line.split("\t",-1);
            if (fields.length != 4) throw new AssertionError("fixture encoding");
            for (int index=0;index<4;index++) fields[index] = fields[index].equals("-") ? null : new String(Base64.getDecoder().decode(fields[index]),StandardCharsets.UTF_8);
            rows.add(row(fields[0],fields[1],fields[2],fields[3]));
        }
        return rows;
    }
    private static Object row(String type,String name,String table,String sql) throws Exception {
        return rowType.getDeclaredConstructor(String.class,String.class,String.class,String.class).newInstance(type,name,table,sql);
    }
    private static List<Long> versions(int count) {
        List<Long> versions = new ArrayList<>();
        for (long version=1;version<=count;version++) versions.add(version);
        return versions;
    }
    private static Object mobile(List<Object> rows,List<Long> versions) throws Exception {
        try { return schema.getDeclaredMethod("mobile",List.class,List.class).invoke(null,rows,versions); }
        catch (InvocationTargetException failure) { throw (IllegalStateException)failure.getCause(); }
    }
    private static void reject(List<Object> rows,List<Long> versions) throws Exception {
        try { mobile(rows,versions); throw new AssertionError("unknown/incomplete schema accepted"); }
        catch (IllegalStateException expected) {
            checked(expected.getMessage().matches("SCHEMA_[A-Z_]+") && expected.getCause()==null,"schema failure sanitized");
        }
    }
    private static void rejectAsync(List<Object> rows,long version) throws Exception {
        try { schema.getDeclaredMethod("async",List.class,long.class).invoke(null,rows,version); throw new AssertionError("unknown AsyncStorage schema accepted"); }
        catch (InvocationTargetException failure) {
            Throwable expected = failure.getCause();
            checked(expected instanceof IllegalStateException && expected.getMessage().matches("SCHEMA_[A-Z_]+") && expected.getCause()==null,"async failure sanitized");
        }
    }
    private static boolean flag(Object coverage,String name) throws Exception { return (boolean)coverage.getClass().getMethod(name).invoke(coverage); }
    private static int integer(Object coverage,String name) throws Exception { return (int)coverage.getClass().getMethod(name).invoke(coverage); }
    private static String text(Object object,String name) throws Exception { return (String)object.getClass().getMethod(name).invoke(object); }
    private static void checked(boolean condition,String label) { if (!condition) throw new AssertionError(label); checks++; }
}
