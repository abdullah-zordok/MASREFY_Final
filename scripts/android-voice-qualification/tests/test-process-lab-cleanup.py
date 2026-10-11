"""Exercise the real fixture against controlled Android boundaries; no device calls."""
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

# Only platform methods reached by ProcessLab are substituted. Policy and fixture
# control flow are compiled from the real sources, not copied into the test.
STUBS = {
    'android/app/Application.java': '''package android.app;
public class Application { public static String getProcessName(){return "com.masarifi.voicequalification.processfixture:inspect";} }''',
    'android/app/Instrumentation.java': '''package android.app;
public class Instrumentation {
 public android.os.Bundle result;
 public Application newApplication(ClassLoader loader,String name,android.content.Context context)
 throws InstantiationException,IllegalAccessException,ClassNotFoundException {return new Application();}
 public void onCreate(android.os.Bundle args){} public void start(){} public void onStart(){}
 public void finish(int code,android.os.Bundle receipt){result=receipt;}
}''',
    'android/app/ActivityManager.java': '''package android.app;
public abstract class ActivityManager {
 public static class RunningAppProcessInfo {
  public int uid,pid; public String processName;
  public RunningAppProcessInfo(int u,int p,String n){uid=u;pid=p;processName=n;}
 }
 public abstract java.util.List<RunningAppProcessInfo> getRunningAppProcesses();
}''',
    'android/app/NotificationManager.java': '''package android.app;
public class NotificationManager {public boolean isNotificationListenerAccessGranted(android.content.ComponentName n){return false;}}''',
    'android/content/ComponentName.java': '''package android.content;
public class ComponentName {public final String name; public ComponentName(String p,String n){name=n;}}''',
    'android/content/Intent.java': '''package android.content;
public class Intent {public ComponentName component; public Intent setComponent(ComponentName n){component=n;return this;}}''',
    'android/content/ServiceConnection.java': '''package android.content;
public interface ServiceConnection {void onServiceConnected(ComponentName n,android.os.IBinder b);void onServiceDisconnected(ComponentName n);}''',
    'android/content/Context.java': '''package android.content;
public abstract class Context {
 public static final int BIND_AUTO_CREATE=1;
 public String getPackageName(){return "com.masarifi.voicequalification.processfixture";}
 public abstract <T>T getSystemService(Class<T> type);
 public abstract boolean bindService(Intent i,int flags,java.util.concurrent.Executor e,ServiceConnection c);
 public abstract void unbindService(ServiceConnection c);
}''',
    'android/os/Process.java': '''package android.os;
public class Process {public static int myUid(){return 10304;}public static int myPid(){return 100;}}''',
    'android/os/Bundle.java': '''package android.os;
public class Bundle extends java.util.HashMap<String,String> {
 public void putString(String k,String v){put(k,v);}public String getString(String k){return get(k);}
}''',
    'android/os/RemoteException.java': '''package android.os;
public class RemoteException extends Exception {}''',
    'android/os/DeadObjectException.java': '''package android.os;
public class DeadObjectException extends RemoteException {}''',
    'android/os/IBinder.java': '''package android.os;
public interface IBinder {
 int FIRST_CALL_TRANSACTION=1,FLAG_ONEWAY=1;
 boolean transact(int code,Parcel request,Parcel reply,int flags) throws RemoteException;
 boolean isBinderAlive();boolean pingBinder();
}''',
    'android/os/Parcel.java': '''package android.os;
public class Parcel {
 public int[] values;private int offset;
 public static Parcel obtain(){return new Parcel();}public void recycle(){}
 public void writeInterfaceToken(String token){}public void readException(){}
 public int readInt(){return values[offset++];}
}''',
}

HARNESS = '''
import android.app.*;import android.content.*;import android.os.*;
import com.masarifi.voicequalification.processlab.ProcessLab;
public class CleanupHarness extends Context {
 static final String TARGET="com.masarifi.voicequalification.processfixture";
 final String mode;boolean active,isolated,unbound,pinged;int pid;
 CleanupHarness(String mode){this.mode=mode;}
 final ActivityManager manager=new ActivityManager(){
  public java.util.List<RunningAppProcessInfo> getRunningAppProcesses(){
   var rows=new java.util.ArrayList<RunningAppProcessInfo>();
   rows.add(new RunningAppProcessInfo(10304,100,TARGET+":inspect"));
   if(active && !isolated || unbound && mode.equals("visible"))
    rows.add(new RunningAppProcessInfo(10304,pid,TARGET+":normal"));
   return rows;
  }
 };
 public <T>T getSystemService(Class<T> type){return type.cast(type==ActivityManager.class?manager:new NotificationManager());}
 public boolean bindService(Intent intent,int flags,java.util.concurrent.Executor executor,ServiceConnection connection){
  isolated=intent.component.name.endsWith("$Isolated");pid=isolated?102:101;
  active=true;unbound=false;pinged=false;
  executor.execute(()->connection.onServiceConnected(intent.component,new IBinder(){
   public boolean transact(int code,Parcel request,Parcel reply,int transactionFlags) throws RemoteException {
    if(code==FIRST_CALL_TRANSACTION){reply.values=new int[]{mode.equals("invalid")?-1:pid,isolated?99001:10304};return true;}
    if(!unbound)throw new IllegalStateException("Stop must follow unbind");
    if(mode.equals("remote"))throw new RemoteException();
    if(!mode.equals("normal") && (!mode.equals("isolatedDead") || isolated))throw new DeadObjectException();
    active=false;return true;
   }
   public boolean isBinderAlive(){return !pinged || mode.equals("alive");}
   public boolean pingBinder(){pinged=true;return mode.equals("alive");}
  }));return true;
 }
 public void unbindService(ServiceConnection connection){unbound=true;active=false;}
 public static void main(String[] args) throws Exception {
  ProcessLab lab=new ProcessLab();
  lab.newApplication(CleanupHarness.class.getClassLoader(),"android.app.Application",new CleanupHarness(args[0]));
  lab.onStart();
  System.out.println(lab.result.getString("verdict"));
  System.out.println(lab.result.getString("failureStage"));
  System.out.println(lab.result.getString("failureKind"));
 }
}
'''


class ProcessLabCleanupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='public-process-cleanup-')
        root = Path(cls.temporary.name)
        sources = []
        for name, source in {**STUBS, 'CleanupHarness.java': HARNESS}.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(source, encoding='utf-8')
            sources.append(path)
        sources += [ROOT/'android-process-lab/probe/ProcessLab.java', ROOT/'android-probe/AndroidProcessSurvey.java']
        sources += [ROOT/'src/com/masarifi/voicequalification'/name for name in
                    ('PrivateProbeFailure.java', 'PrivateProbeProcessPolicy.java')]
        cls.classes = root/'classes'
        subprocess.run(['javac', '-encoding', 'UTF-8', '-d', str(cls.classes), *map(str, sources)],
                       capture_output=True, text=True, check=True, timeout=30)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def result(self, mode):
        completed = subprocess.run(['java', '-cp', str(self.classes), 'CleanupHarness', mode],
                                   capture_output=True, text=True, check=True, timeout=15)
        return completed.stdout.splitlines()

    def test_normal_stop_passes(self):
        self.assertEqual(self.result('normal')[0], 'PASS_DISPOSABLE_PROCESS_LAB')

    def test_peer_dead_after_unbind_still_requires_and_passes_death_proof(self):
        self.assertEqual(self.result('dead')[0], 'PASS_DISPOSABLE_PROCESS_LAB')

    def test_dead_object_without_framework_absence_fails(self):
        self.assertEqual(self.result('visible'), ['INDETERMINATE_PROCESS_LAB', 'normal_CLEANUP', 'PEER_CLEANUP_UNPROVEN'])

    def test_dead_object_without_binder_death_fails(self):
        self.assertEqual(self.result('alive'), ['INDETERMINATE_PROCESS_LAB', 'normal_CLEANUP', 'PEER_CLEANUP_UNPROVEN'])

    def test_other_remote_errors_remain_failures(self):
        self.assertEqual(self.result('remote')[0], 'INDETERMINATE_PROCESS_LAB')

    def test_isolated_child_dead_after_unbind_passes(self):
        self.assertEqual(self.result('isolatedDead')[0], 'PASS_DISPOSABLE_PROCESS_LAB')

    def test_cleanup_does_not_replace_an_earlier_identity_failure(self):
        self.assertEqual(self.result('invalid'), ['INDETERMINATE_PROCESS_LAB', 'normal_IDENTITY', 'PEER_IDENTITY_INVALID'])


if __name__ == '__main__':
    unittest.main()
