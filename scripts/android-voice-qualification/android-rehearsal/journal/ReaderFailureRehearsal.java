package com.masarifi.voicequalification;

import android.os.Bundle;
import android.os.Parcel;
import java.util.Set;

/** Disposable-only Android Bundle transport test, with public synthetic poison values. */
final class ReaderFailureRehearsal {
    static void verifyWorkSummary(String actual,String expected) {
        Bundle receipt=new Bundle();receipt.putString("workSummary",actual);
        Parcel parcel=Parcel.obtain();
        try {
            parcel.writeBundle(receipt);parcel.setDataPosition(0);
            Bundle decoded=parcel.readBundle(ReaderFailureRehearsal.class.getClassLoader());
            if(decoded==null || !decoded.keySet().equals(Set.of("workSummary")) || expected==null ||
                    !expected.equals(decoded.getString("workSummary")))
                throw new IllegalStateException("WORK_SUMMARY_TRANSPORT_REJECTED");
        } finally {parcel.recycle();}
    }
    static int verify() {
        int cases=0;
        for(var stage:PrivateReaderFailure.Stage.values()) { verify(stage,stage.name());cases++; }
        verify(null,"UNEXPECTED");
        return cases+1;
    }
    static void verifyQualification(Throwable failure,String expected) {
        Bundle receipt=new Bundle();
        PrivateReaderFailure.receipt(PrivateReaderFailure.Stage.QUALIFICATION,failure).forEach(receipt::putString);
        Parcel parcel=Parcel.obtain();
        try {
            parcel.writeBundle(receipt);parcel.setDataPosition(0);
            Bundle decoded=parcel.readBundle(ReaderFailureRehearsal.class.getClassLoader());
            if(decoded==null || !decoded.keySet().equals(Set.of("verdict","readerStage","qualificationStage")) ||
                    !"INDETERMINATE".equals(decoded.getString("verdict")) || !"QUALIFICATION".equals(decoded.getString("readerStage")) ||
                    expected==null || !expected.equals(decoded.getString("qualificationStage")))
                throw new IllegalStateException("QUALIFICATION_STAGE_TRANSPORT_REJECTED");
        } finally {parcel.recycle();}
    }
    private static void verify(PrivateReaderFailure.Stage stage,String expected) {
        Bundle receipt=new Bundle();
        receipt.putString("verdict","CLEAR");receipt.putString("fingerprint","SYNTHETIC_PRIVATE_VALUE");
        receipt.putString("workSummary","SYNTHETIC_PRIVATE_VALUE");receipt.putString("session","SYNTHETIC_PRIVATE_VALUE");receipt.putInt("pending",0);
        try {
            var failure=new IllegalStateException("SYNTHETIC_PRIVATE_VALUE",new Error("SYNTHETIC_PRIVATE_CAUSE"));
            failure.addSuppressed(new Error("SYNTHETIC_PRIVATE_SUPPRESSED"));throw failure;
        } catch(Throwable rejected) {
            receipt.clear();PrivateReaderFailure.receipt(stage).forEach(receipt::putString);
        }
        Parcel parcel=Parcel.obtain();
        try {
            parcel.writeBundle(receipt);parcel.setDataPosition(0);
            Bundle decoded=parcel.readBundle(ReaderFailureRehearsal.class.getClassLoader());
            if(decoded==null || !decoded.keySet().equals(Set.of("verdict","readerStage")) ||
                    !"INDETERMINATE".equals(decoded.getString("verdict")) || !expected.equals(decoded.getString("readerStage")))
                throw new IllegalStateException("READER_STAGE_TRANSPORT_REJECTED");
        } finally {parcel.recycle();}
    }
}
