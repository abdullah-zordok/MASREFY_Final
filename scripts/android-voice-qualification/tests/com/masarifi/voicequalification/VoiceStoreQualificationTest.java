package com.masarifi.voicequalification;

import java.lang.reflect.InvocationTargetException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Whole-store behavior; only the SQL engine boundary is replaced with pinned synthetic rows. */
public final class VoiceStoreQualificationTest {
    private static final String A="a".repeat(64), B="b".repeat(64), ID="11111111-1111-4111-8111-111111111111";
    private static final SecretKeySpec AES = new SecretKeySpec(new byte[32],"AES");
    private static final String OWNER_A="files/SQLite/masarifi-"+A.substring(0,24)+".db";
    private static final String OWNER_B="files/SQLite/masarifi-"+B.substring(0,24)+".db";
    private static Class<?> binder;
    private static Path schemas;
    private static int checks;

    public static void main(String[] args) throws Exception {
        try { binder=Class.forName("com.masarifi.voicequalification.VoiceStoreQualification"); }
        catch (ClassNotFoundException missing) { throw new AssertionError("whole-store journal qualification is not implemented"); }
        schemas=Path.of(args[0]);
        var empty = fixture();
        assertVerdict(empty,"CLEAR",0,0,0,0);
        var all = fixture(); all.owner(B,2); all.rows.get(2).put(SnapshotReader.Query.BATCH,List.<Object[]>of(new Object[]{ID,2L,batch("processing")}));
        assertVerdict(all,"BLOCKED",1,0,0,0);
        all.rows.get(2).put(SnapshotReader.Query.BATCH,List.<Object[]>of(new Object[]{ID,2L,batch("completed")}));
        assertVerdict(all,"CLEAR",0,1,0,0);
        all.rows.get(1).put(SnapshotReader.Query.SINGLETON,List.<Object[]>of(new Object[]{"singleton",ID,2L,singleton("terminal",true)}));
        assertVerdict(all,"BLOCKED",0,2,1,1);
        var legacy=fixture(); legacy.legacy(A,true); assertVerdict(legacy,"CLEAR",0,0,0,0);
        legacy.rows.get(3).put(SnapshotReader.Query.BATCH,List.<Object[]>of(new Object[]{ID,2L,batch("processing")}));
        assertVerdict(legacy,"BLOCKED",1,0,0,0);
        var async=fixture(); async.async(); async.rows.get(4).put(SnapshotReader.Query.LEGACY,List.<Object[]>of(new Object[]{"masarifi.voice.pending."+B.substring(0,24),legacyPayload()}));
        assertVerdict(async,"BLOCKED",1,0,0,0);
        var unrelated=fixture(); unrelated.async(); unrelated.rows.get(4).put(SnapshotReader.Query.LEGACY,List.<Object[]>of(new Object[]{"ordinary-preference","public-fixture-value"}));
        assertVerdict(unrelated,"CLEAR",0,0,0,0);
        unrelated.rows.get(4).put(SnapshotReader.Query.LEGACY,List.<Object[]>of(new Object[]{" MASARIFI.VOICE.pending","private-malformed-value"}));reject(unrelated);
        // A malformed second owner cannot be hidden by a pending first owner.
        all.rows.get(2).put(SnapshotReader.Query.BATCH,List.<Object[]>of(new Object[]{ID,2L,"private-invalid-payload"})); reject(all);
        var missing=fixture(); missing.files.remove(OWNER_A); reject(missing);
        missing=fixture(); missing.preferences="<map/>"; reject(missing);
        missing=fixture(); missing.preferences=null; reject(missing);
        missing=fixture(); missing.rows.get(1).put(SnapshotReader.Query.MIGRATIONS,List.<Object[]>of(new Object[]{15L})); reject(missing);
        missing=fixture(); missing.rows.get(1).put(SnapshotReader.Query.SCHEMA,List.of()); reject(missing);
        missing=fixture(); missing.rows.get(1).put(SnapshotReader.Query.USER_VERSION,List.<Object[]>of(new Object[]{1L})); reject(missing);
        missing=fixture(); missing.rows.get(1).put(SnapshotReader.Query.BATCH,List.<Object[]>of(new Object[]{ID,2L,null})); reject(missing);
        missing=fixture(); missing.rows.get(1).put(SnapshotReader.Query.BATCH,List.<Object[]>of(new Object[]{ID,"2",batch("completed")})); reject(missing);
        missing=fixture(); missing.files.put(OWNER_A+"-journal",new byte[0]); reject(missing);
        missing=fixture(); missing.files.put(OWNER_A+"-journal",new byte[512]); reject(missing);
        missing=fixture(); missing.files.put(OWNER_A+"-wal",new byte[1]); reject(missing);
        missing=fixture(); missing.files.put("databases/RKStorage",new byte[]{9}); reject(missing);
        missing=fixture(); missing.files.put(OWNER_A,new byte[0]); reject(missing);
        missing=fixture(); missing.files.clear(); missing.preferences="<map/>"; reject(missing);
        missing=fixture(); missing.files.clear(); missing.preferences="<map/>"; missing.async(); reject(missing);
        for (String claim : new String[]{A,B}) {
            missing=fixture(); missing.legacy(claim,false); reject(missing);
        }
        missing=fixture(); missing.legacy(A,true); missing.rows.get(1).put(SnapshotReader.Query.MARKER,List.<Object[]>of(new Object[]{"legacy-export-owner",B})); reject(missing);
        missing=fixture(); missing.legacy(A,true); missing.rows.get(1).put(SnapshotReader.Query.MARKER,List.<Object[]>of(new Object[]{"unknown",A})); reject(missing);
        missing=fixture(); missing.legacy(A,true); missing.rows.get(1).put(SnapshotReader.Query.MARKER,List.of()); reject(missing);
        missing=fixture(); missing.legacy(A,true); missing.preferences=missing.preferences.replace(envelope(A),envelope(A.toUpperCase(java.util.Locale.ROOT)));reject(missing);
        missing=fixture(); missing.legacy(A,true); missing.rows.get(1).put(SnapshotReader.Query.MARKER,List.<Object[]>of(new Object[]{"legacy-export-owner",A},new Object[]{"legacy-export-owner",A})); reject(missing);
        missing=fixture(); missing.legacy(A,true); missing.files.remove("files/SQLite/masarifi.db"); missing.preferences=ownerXml(A); reject(missing);
        missing=fixture(); missing.preferences=ownerXml(A).replace("</map>",entry("masarifi.database.key."+A,envelope("11".repeat(32)))+"</map>"); reject(missing);
        missing=fixture(); missing.preferences=ownerXml(A).replace("</map>",entry("masarifi.database.key."+A.substring(0,24)+"c".repeat(40),envelope("11".repeat(32)))+"</map>"); reject(missing);
        missing=fixture(); missing.extraPreferences=ownerXml(A); reject(missing);
        missing=fixture(); missing.extraPreferences="<map>"+entry("masarifi.database.key."+B,envelope("11".repeat(32)))+"</map>"; reject(missing);
        missing=fixture(); missing.preferences=ownerXml(A).replace("</map>",entry("masarifi.database.legacyOwnerHash","invalid-envelope")+"</map>"); reject(missing);
        missing=fixture(); missing.failLookup=true; reject(missing);
        missing=fixture(); missing.throwReader=true; reject(missing);
        missing=fixture(); missing.mutate=true; reject(missing);
        System.out.println("PASS: "+checks+" whole-store synthetic journal checks; no device/private key accessed");
    }

    static String batch(String phase) { return "{\"id\":\""+ID+"\",\"revision\":2,\"phase\":\""+phase+"\",\"audioReference\":null,\"locale\":\"ar\",\"durationMs\":1000,\"recordedAt\":0,\"timezoneOffsetMinutes\":0,\"createBody\":null,\"sessionId\":null,\"version\":null,\"processBody\":null}"; }
    static String singleton(String phase,boolean retained) { return "{\"attemptId\":\""+ID+"\",\"revision\":2,\"phase\":\""+phase+"\",\"createKey\":\""+ID+"\",\"processKey\":\""+ID+"\",\"cancelKey\":\""+ID+"\",\"createBody\":null,\"sessionId\":null,\"sessionVersion\":null,\"processBody\":null,\"proposalId\":null,\"proposalVersion\":null,\"confirmationKey\":null,\"confirmationBody\":"+(retained?"{}":"null")+",\"transactionId\":null,\"audioReference\":"+(retained?"\"private-audio-reference\"":"null")+",\"createdAt\":0}"; }
    static String legacyPayload() { return "{\"sessionId\":\""+ID+"\",\"sessionVersion\":1,\"recordedAt\":0,\"timezoneOffsetMinutes\":0,\"createdAt\":0}"; }
    private static String entry(String name,String envelope) { return "<string name='"+name+"'>"+envelope.replace("&","&amp;").replace("<","&lt;")+"</string>"; }
    static String envelope(String hex) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,AES,new GCMParameterSpec(128,new byte[12]));
        return "{\"scheme\":\"aes\",\"iv\":\""+Base64.getEncoder().encodeToString(new byte[12])+"\",\"ct\":\""+Base64.getEncoder().encodeToString(cipher.doFinal(hex.getBytes(StandardCharsets.US_ASCII)))+"\",\"tlen\":128}";
    }
    private static String ownerXml(String owner) throws Exception { return "<map>"+entry("key_v1-masarifi.database.key."+owner,envelope("11".repeat(32)))+"</map>"; }
    private static Fixture fixture() throws Exception { var fixture=new Fixture();fixture.owner(A,1);return fixture; }
    private static void check(boolean condition,String label) { if (!condition) throw new AssertionError(label);checks++; }
    private static Object run(Fixture fixture) throws Exception {
        Path root=Files.createTempDirectory("vqs-whole-store-synthetic-");
        for (var file:fixture.files.entrySet()) { Path path=root.resolve(file.getKey());Files.createDirectories(path.getParent());Files.write(path,file.getValue()); }
        if (fixture.preferences!=null) { Files.createDirectories(root.resolve("shared_prefs"));Files.writeString(root.resolve("shared_prefs/SecureStore.xml"),fixture.preferences); }
        if (fixture.extraPreferences!=null) Files.writeString(root.resolve("shared_prefs/com.masarifi.mobile_preferences.xml"),fixture.extraPreferences);
        try (var snapshot=VoiceStoreSnapshot.capture(root)) {
            try { return binder.getDeclaredMethod("qualify",VoiceStoreSnapshot.class,ExistingDatabaseKey.ExistingKeySource.class,SnapshotReader.Factory.class)
                    .invoke(null,snapshot,(ExistingDatabaseKey.ExistingKeySource)(alias -> fixture.failLookup?null:AES),fixture.factory(root)); }
            catch (InvocationTargetException invalid) { if(invalid.getCause() instanceof RuntimeException runtime)throw runtime;throw invalid; }
        }
    }
    private static int count(Object result,String field) throws Exception { return (int)result.getClass().getDeclaredMethod(field).invoke(result); }
    private static void assertVerdict(Fixture fixture,String verdict,int pending,int terminal,int audio,int confirmations) throws Exception {
        Object result=run(fixture);
        check(result.getClass().getDeclaredMethod("verdict").invoke(result).equals(verdict),"full inventory verdict");
        check(count(result,"pending")==pending && count(result,"terminal")==terminal && count(result,"audioOwned")==audio && count(result,"confirmationOwned")==confirmations,"all store rows accounted");
        check(!result.toString().contains(A.substring(0,24))&&!result.toString().contains(ID)&&!result.toString().contains("private"),"receipt contains no private identities/payloads");
        check(fixture.closed==fixture.opened && fixture.keyArrays.stream().allMatch(bytes -> Arrays.equals(bytes,new byte[bytes.length])),"every native reader closed and temporary keys cleared");
    }
    private static void reject(Fixture fixture) throws Exception {
        try { run(fixture);throw new AssertionError("incomplete/corrupt/unstable store returned verdict"); }
        catch (IllegalStateException expected) { check(expected.getCause()==null&&expected.getMessage().matches("[A-Z_]+"),"indeterminate failure sanitized"); }
        check(fixture.closed==fixture.opened,"failure closes all opened readers");
    }
    private static final class Fixture {
        final Map<String,byte[]> files=new HashMap<>();final Map<Integer,Map<SnapshotReader.Query,List<Object[]>>> rows=new HashMap<>();
        final List<byte[]> keyArrays=new ArrayList<>(); String preferences,extraPreferences;boolean failLookup,throwReader,mutate;int opened,closed;
        void owner(String hash,int index) throws Exception {
            files.put("files/SQLite/masarifi-"+hash.substring(0,24)+".db",new byte[]{(byte)index});
            String xml=ownerXml(hash);preferences=preferences==null?xml:preferences.replace("</map>",xml.substring(5));
            rows.put(index,mobile(false));
        }
        void legacy(String claim,boolean marker) throws Exception {
            files.put("files/SQLite/masarifi.db",new byte[]{3}); rows.put(3,mobile(false));
            preferences=preferences.replace("</map>",entry("key_v1-masarifi.database.legacyOwnerHash",envelope(claim))+"</map>");
            if(marker) { rows.put(1,mobile(true));rows.get(1).put(SnapshotReader.Query.MARKER,List.<Object[]>of(new Object[]{"legacy-export-owner",claim})); }
        }
        void async() throws Exception { files.put("databases/RKStorage",new byte[]{4});var data=new HashMap<SnapshotReader.Query,List<Object[]>>();data.put(SnapshotReader.Query.SCHEMA,schema("async"));data.put(SnapshotReader.Query.USER_VERSION,List.<Object[]>of(new Object[]{1L}));data.put(SnapshotReader.Query.LEGACY,List.of());rows.put(4,data); }
        SnapshotReader.Factory factory(Path root) { return (database,key) -> {
            if(throwReader)throw new IllegalStateException("private reader failure");
            if(database.length==0)throw new IllegalStateException("private empty database");
            int id=database[0]; if (!rows.containsKey(id))throw new IllegalStateException("private unknown input");
            if(id==1||id==2) { if(key==null||key.length!=32)throw new AssertionError("owner key must reach native reader");keyArrays.add(key); }
            else if(key!=null)throw new AssertionError("plaintext legacy/async must not receive owner key");
            opened++;
            return new SnapshotReader() {
                public void visit(Query query,Consumer<Object[]> visitor) { if(mutate)try {Files.write(root.resolve(OWNER_A),new byte[]{9});}catch(Exception e){throw new IllegalStateException("test mutation");}var values=rows.get(id).get(query);if(values==null)throw new IllegalStateException("query unavailable");for(var row:values)visitor.accept(row); }
                public void close() {closed++;}
            };
        }; }
        static Map<SnapshotReader.Query,List<Object[]>> mobile(boolean marker) throws Exception {
            var data=new HashMap<SnapshotReader.Query,List<Object[]>>();data.put(SnapshotReader.Query.SCHEMA,schema(marker?"marked-15":"prefix-15"));
            var history=new ArrayList<Object[]>();for(long i=1;i<=15;i++)history.add(new Object[]{i});data.put(SnapshotReader.Query.MIGRATIONS,history);
            data.put(SnapshotReader.Query.USER_VERSION,List.<Object[]>of(new Object[]{0L}));data.put(SnapshotReader.Query.BATCH,List.of());data.put(SnapshotReader.Query.SINGLETON,List.of());data.put(SnapshotReader.Query.MARKER,List.of());return data;
        }
        static List<Object[]> schema(String name) throws Exception {
            var rows=new ArrayList<Object[]>();for(String line:Files.readAllLines(schemas.resolve(name+".rows"))) {
                var fields=line.split("\t",-1);Object[] row=new Object[4];for(int i=0;i<4;i++)row[i]=fields[i].equals("-")?null:new String(Base64.getDecoder().decode(fields[i]),StandardCharsets.UTF_8);rows.add(row);
            }return rows;
        }
    }
}
