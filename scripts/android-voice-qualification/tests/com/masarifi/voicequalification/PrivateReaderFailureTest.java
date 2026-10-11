package com.masarifi.voicequalification;
import java.util.Map;
public final class PrivateReaderFailureTest {
 public static void main(String[] args) {
  for(var stage:PrivateReaderFailure.Stage.values()) {
   var report=PrivateReaderFailure.receipt(stage);
   if(!report.equals(Map.of("verdict","INDETERMINATE","readerStage",stage.name())))throw new AssertionError("Unexpected report");
   try {report.put("privateValue","SECRET");throw new AssertionError("Mutable receipt");}
   catch(UnsupportedOperationException expected) {}
  }
  if(!PrivateReaderFailure.receipt(null).get("readerStage").equals("UNEXPECTED"))throw new AssertionError("Null stage");
  Throwable poison=new IllegalStateException("OWNER_KEY_DECRYPT") {
   @Override public String getMessage() {throw new AssertionError("Exception text inspected");}
   @Override public synchronized Throwable getCause() {throw new AssertionError("Exception cause inspected");}
  };
  if(PrivateReaderFailure.receipt(PrivateReaderFailure.Stage.QUALIFICATION,poison).size()!=2)throw new AssertionError("Untrusted stage");
  try {VoiceStoreQualification.qualify(null,null,(db,key)->{throw new AssertionError("Invalid input reached SQL");});}
  catch(IllegalStateException failure) {
   var report=PrivateReaderFailure.receipt(PrivateReaderFailure.Stage.QUALIFICATION,failure);
   if(!"INPUT".equals(report.get("qualificationStage")) || report.size()!=3)throw new AssertionError("Typed stage missing");
   if(PrivateReaderFailure.receipt(PrivateReaderFailure.Stage.NATIVE_LOAD,failure).size()!=2)throw new AssertionError("Wrong outer stage");
  }
  System.out.println("PASS closed reader stages "+PrivateReaderFailure.Stage.values().length);
 }
}
