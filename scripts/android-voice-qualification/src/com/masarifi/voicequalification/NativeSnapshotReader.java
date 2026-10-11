package com.masarifi.voicequalification;

import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.function.Consumer;

/** Independent JNI reader. No application SQL/runtime loader and no path/SQL inputs. */
final class NativeSnapshotReader implements SnapshotReader {
    private long handle;
    private Consumer<Object[]> visitor;
    private NativeSnapshotReader(long handle) {this.handle=handle;}
    static void loadLibrary() {
        try {System.loadLibrary("voice_private_reader");}
        catch(LinkageError unavailable){throw failure("SNAPSHOT_LIBRARY");}
    }
    static NativeSnapshotReader open(byte[] database,byte[] key) {
        long handle=nOpen(database,key);
        if(handle==0)throw failure("SNAPSHOT_OPEN");return new NativeSnapshotReader(handle);
    }
    @Override public synchronized void visit(Query query,Consumer<Object[]> consumer) {
        if(handle==0 || query==null || consumer==null || visitor!=null)throw failure("SNAPSHOT_INPUT");
        visitor=consumer;
        try {int status=nVisit(handle,query.ordinal());if(status!=0)throw failure("SNAPSHOT_QUERY");}
        finally {visitor=null;}
    }
    // JNI passes length-bounded byte arrays, never NewStringUTF (modified UTF8).
    private void accept(int[] kinds,long[] integers,byte[][] bytes) {visitor.accept(decode(kinds,integers,bytes));}
    static Object[] decode(int[] kinds,long[] integers,byte[][] bytes) {
        try {
            if(kinds==null || integers==null || bytes==null || kinds.length<1 || kinds.length>4 ||
                    kinds.length!=integers.length || kinds.length!=bytes.length)throw failure("SNAPSHOT_COLUMN");
            Object[] row=new Object[kinds.length];
            for(int index=0;index<row.length;index++) {
                if(kinds[index]==1 && bytes[index]==null)row[index]=integers[index];
                else if(kinds[index]==5 && bytes[index]==null)row[index]=null;
                else if(kinds[index]==3 && bytes[index]!=null && bytes[index].length<=98304) {
                    String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes[index])).toString();
                    if(text.indexOf(0)>=0)throw failure("SNAPSHOT_COLUMN");row[index]=text;
                } else throw failure("SNAPSHOT_COLUMN");
            }
            return row;
        } catch(java.nio.charset.CharacterCodingException invalid){throw failure("SNAPSHOT_ENCODING");}
        finally {if(bytes!=null)for(byte[] column:bytes)if(column!=null)Arrays.fill(column,(byte)0);}
    }
    @Override public synchronized void close() {
        if(visitor!=null)throw failure("SNAPSHOT_BUSY");
        if(handle!=0) {if(nClose(handle)!=0)throw failure("SNAPSHOT_CLOSE");handle=0;}
    }
    private static native long nOpen(byte[] database,byte[] key);
    private native int nVisit(long handle,int query);
    private static native int nClose(long handle);
    private static IllegalStateException failure(String code){return new IllegalStateException(code);}
}
