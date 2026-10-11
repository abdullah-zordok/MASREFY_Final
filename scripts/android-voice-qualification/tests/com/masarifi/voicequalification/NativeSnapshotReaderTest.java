package com.masarifi.voicequalification;

import java.lang.reflect.InvocationTargetException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Strict native boundary row types/UTF8/zeroing; host-safe, no JNI loading required. */
public final class NativeSnapshotReaderTest {
    private static Class<?> reader;
    private static int checks;
    public static void main(String[] args) throws Exception {
        try {reader=Class.forName("com.masarifi.voicequalification.NativeSnapshotReader");}
        catch(ClassNotFoundException missing){throw new AssertionError("strict JNI snapshot reader is not implemented");}
        byte[] privateText="قهوة 😀".getBytes(StandardCharsets.UTF_8);
        Object[] decoded=decode(new int[]{1,3,5},new long[]{7,0,0},new byte[][]{null,privateText,null});
        check(decoded.length==3&&decoded[0].equals(7L)&&decoded[1].equals("قهوة 😀")&&decoded[2]==null,"strict row types preserve UTF8/null/integer");
        check(Arrays.equals(privateText,new byte[privateText.length]),"native copied text cleared after decode");
        for(byte[] corrupt:new byte[][]{{(byte)0xc3,0x28},{0},{(byte)0xed,(byte)0xa0,(byte)0x80}}) {
            reject(new int[]{3},new long[]{0},new byte[][]{corrupt});
            check(Arrays.equals(corrupt,new byte[corrupt.length]),"corrupt native text cleared on failure");
        }
        for(int unsupported:new int[]{0,2,4,6})reject(new int[]{unsupported},new long[]{1},new byte[][]{null});
        reject(new int[]{3},new long[]{0},new byte[][]{null});
        reject(new int[]{1},new long[]{0},new byte[][]{new byte[]{1}});
        reject(new int[]{1,3},new long[]{0},new byte[][]{null,null});
        reject(new int[0],new long[0],new byte[0][]);
        reject(new int[]{3},new long[]{0},new byte[][]{new byte[98305]});
        check(decode(new int[]{3},new long[]{0},new byte[][]{new byte[0]})[0].equals(""),"valid empty TEXT remains distinct from NULL");
        System.out.println("PASS: "+checks+" strict JNI row boundary checks; no native library/device loaded");
    }
    private static Object[] decode(int[] kinds,long[] integers,byte[][] text) throws Exception {
        try{return (Object[])reader.getDeclaredMethod("decode",int[].class,long[].class,byte[][].class).invoke(null,kinds,integers,text);}
        catch(InvocationTargetException invalid){if(invalid.getCause() instanceof RuntimeException error)throw error;throw invalid;}
    }
    private static void reject(int[] kinds,long[] integers,byte[][] text) throws Exception {
        try{decode(kinds,integers,text);throw new AssertionError("corrupt/unknown native column accepted");}
        catch(IllegalStateException expected){check(expected.getCause()==null&&expected.getMessage().matches("SNAPSHOT_[A-Z_]+"),"native failure sanitized");}
    }
    private static void check(boolean okay,String label){if(!okay)throw new AssertionError(label);checks++;}
}
