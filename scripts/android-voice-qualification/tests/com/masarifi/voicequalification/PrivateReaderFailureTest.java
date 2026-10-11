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
  System.out.println("PASS closed reader stages "+PrivateReaderFailure.Stage.values().length);
 }
}
