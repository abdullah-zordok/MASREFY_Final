"""Exercise synthetic control accounting without contacting a device."""
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("bootstrap", Path(__file__).resolve().parents[1] / "android-rehearsal/test-bootstrap.py")
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)

class FixtureEmulator:
    def __init__(self, activities):
        self.logs = iter(["", "TARGET_APPLICATION_CONSTRUCTED\n" +
                          "".join(f"MARK={index+1} COMPONENT={component}\n" for index,component in
                                  enumerate(["PROVIDER"]*4+["APPLICATION"]+["ACTIVITY"]*activities))])
        self.commands = []
    def fixture_log(self): return next(self.logs)
    def command(self,*arguments): self.commands.append(arguments);return ""

class ControlObservationsTest(unittest.TestCase):
    def test_platform_barriers_require_explicit_completion(self):
        class BarrierEmulator:
            def __init__(self,outputs):self.outputs=iter(outputs);self.commands=[]
            def command(self,*arguments,**kwargs):self.commands.append(arguments);return next(self.outputs)
        emulator=BarrierEmulator(["All broadcast queues are idle!\n","Finished application barriers!\n"])
        bootstrap.drain_framework(emulator)
        self.assertEqual(emulator.commands,[("shell","am","wait-for-broadcast-idle","--flush-broadcast-loopers"),
                                           ("shell","am","wait-for-application-barrier")])
        for outputs in (["", "Finished application barriers!"],
                        ["All broadcast queues are idle!", "Gave up waiting for application barriers!"],
                        ["All broadcast queues are idle!", "Finished application barriers!\nGave up waiting for application barriers!"]):
            with self.subTest(outputs=outputs),self.assertRaisesRegex(RuntimeError,"FRAMEWORK_BARRIER_FAILED"):
                bootstrap.drain_framework(BarrierEmulator(outputs))
    def test_global_state_is_bounded_and_not_logged_raw(self):
        class StateEmulator:
            def __init__(self):self.log=io.StringIO();self.commands=[]
            def command(self,*arguments,**kwargs):
                self.commands.append((arguments,kwargs))
                return {("shell","getprop","sys.boot_completed"):"1\n",
                        ("shell","getprop","init.svc.bootanim"):"stopped\n",
                        ("shell","am","get-started-user-state","0"):"RUNNING_UNLOCKED\n",
                        ("shell","dumpsys","activity","processes"):"unrelated PRIVATE PAYLOAD\n  mGlobalConfiguration: {1.0 en_US as.3 s.9}\n",
                        ("shell","cmd","overlay","list","--user","0","android"):"android\n[x] com.android.systemui:neutral\n"}[arguments]
        emulator=StateEmulator();state=bootstrap.framework_state(emulator)
        self.assertTrue(state["ready"]);self.assertEqual(state["assetsSequence"],3)
        self.assertEqual(state["configurationSequence"],9)
        self.assertTrue(all(kwargs=={"retain_output":False} for _,kwargs in emulator.commands))
        self.assertNotIn("PRIVATE PAYLOAD",emulator.log.getvalue())
    def test_missing_ambiguous_and_oversized_config_fail_closed(self):
        for value in ("", "mGlobalConfiguration: {s.1}\nmGlobalConfiguration: {s.2}",
                      "mGlobalConfiguration: "+"x"*4097,"mGlobalConfiguration: {winConfig={s.1}",
                      "mGlobalConfiguration: {s.1}{}","mGlobalConfiguration: {as.invalid}",
                      "mGlobalConfiguration: {s.1 s.2}"):
            with self.subTest(size=len(value)),self.assertRaisesRegex(RuntimeError,"GLOBAL_CONFIGURATION_UNAVAILABLE"):
                bootstrap.configuration_identity(value)
    def test_actual_configuration_nested_window_shape_uses_top_level_sequences(self):
        value="{1.0 ?mcc0mnc [en_US] ldltr sw411dp w411dp h866dp 420dpi nrml long port "\
              "finger -keyb/v/h -nav/h winConfig={ mBounds=Rect(0, 0 - 1080, 2400) "\
              "mAppBounds=Rect(0, 0 - 1080, 2274) mMaxBounds=Rect(0, 0 - 1080, 2400) "\
              "mDisplayRotation=ROTATION_0 mWindowingMode=fullscreen as.99 s.99 } as.3 s.9 fontWeightAdjustment=0}"
        observed=bootstrap.configuration_identity("  mGlobalConfiguration: "+value+"\n")
        self.assertEqual(observed["assetsSequence"],3);self.assertEqual(observed["configurationSequence"],9)
    def test_framework_diagnostics_retain_fixture_and_fixed_theme_counts_only(self):
        class DiagnosticEmulator:
            def __init__(self):self.log=io.StringIO();self.commands=[]
            def command(self,*arguments,**kwargs):
                self.commands.append((arguments,kwargs))
                return "ActivityTaskManager unrelated PRIVATE_PAYLOAD\nThemeOverlayController PRIVATE_COLOR\n"+\
                       "VQSFixture TARGET_ACTIVITY_DESTROY changing=true configurationMask=-2147483648\n"
        emulator=DiagnosticEmulator()
        with patch.object(bootstrap,"framework_state",return_value={"ready":False}):
            bootstrap.Emulator.framework_diagnostics(emulator)
        log=emulator.log.getvalue()
        self.assertNotIn("PRIVATE_PAYLOAD",log);self.assertNotIn("PRIVATE_COLOR",log)
        self.assertIn("configurationMask=-2147483648",log)
        self.assertIn('"ThemeOverlayController": 1',log)
        self.assertEqual(emulator.commands[0][0][3],"10000")
    def test_pre_control_stability_resets_on_change_and_never_starts_target(self):
        stable={"ready":True,"configurationSha256":"a"*64,"overlaySha256":"b"*64,
                "assetsSequence":3,"configurationSequence":9}
        changing=dict(stable,configurationSha256="c"*64)
        states=iter([changing,stable,stable,stable,stable,stable])
        emulator=type("QuietEmulator",(),{"log":io.StringIO()})();receipt={}
        with patch.object(bootstrap,"drain_framework") as drain,patch.object(bootstrap,"framework_state",side_effect=lambda _:next(states)),patch.object(bootstrap.time,"sleep"):
            bootstrap.await_framework_quiet(emulator,receipt)
        self.assertEqual(drain.call_count,6)
        self.assertEqual(receipt["frameworkPrecondition"]["samples"],6)
        self.assertEqual(receipt["frameworkPrecondition"]["stableSamples"],5)
    def test_unstable_framework_is_bounded_and_rejected(self):
        emulator=type("QuietEmulator",(),{"log":io.StringIO()})();receipt={}
        with patch.object(bootstrap,"drain_framework"),patch.object(bootstrap,"framework_state",return_value={"ready":False}),patch.object(bootstrap.time,"sleep"):
            with self.assertRaisesRegex(RuntimeError,"FRAMEWORK_NOT_QUIESCENT"):
                bootstrap.await_framework_quiet(emulator,receipt)
        self.assertEqual(receipt["frameworkPrecondition"]["samples"],60)
        self.assertEqual(receipt["frameworkPrecondition"]["stableSamples"],0)
    def test_precondition_deadline_clamps_command_and_rejects_exhaustion(self):
        emulator=bootstrap.Emulator.__new__(bootstrap.Emulator)
        emulator.arguments=SimpleNamespace(adb=Path("unused-adb"),serial="emulator-5580")
        emulator.log=io.StringIO();emulator.command_deadline=100.0
        result=SimpleNamespace(returncode=0,stdout="public",stderr="")
        with patch.object(bootstrap.time,"monotonic",return_value=97.5),patch.object(bootstrap.subprocess,"run",return_value=result) as command:
            self.assertEqual(emulator.command("shell","getprop","sys.boot_completed"),"public")
        self.assertEqual(command.call_args.kwargs["timeout"],2.5)
        with patch.object(bootstrap.time,"monotonic",return_value=100.0),patch.object(bootstrap.subprocess,"run") as command:
            with self.assertRaisesRegex(RuntimeError,"FRAMEWORK_PRECONDITION_DEADLINE"):
                emulator.command("shell","getprop","sys.boot_completed")
        command.assert_not_called()
        with patch.object(bootstrap.time,"monotonic",side_effect=[97.5,100.0]),patch.object(bootstrap.subprocess,"run",return_value=result):
            with self.assertRaisesRegex(RuntimeError,"FRAMEWORK_PRECONDITION_DEADLINE"):
                emulator.command("shell","getprop","sys.boot_completed")
    def test_successful_slow_observations_consume_global_deadline(self):
        emulator=type("QuietEmulator",(),{"log":io.StringIO()})();receipt={};now=[0.0]
        def state(_):now[0]+=61;return {"ready":True}
        with patch.object(bootstrap,"drain_framework"),patch.object(bootstrap,"framework_state",side_effect=state),\
             patch.object(bootstrap.time,"monotonic",side_effect=lambda:now[0]),patch.object(bootstrap.time,"sleep"):
            with self.assertRaisesRegex(RuntimeError,"FRAMEWORK_PRECONDITION_DEADLINE"):
                bootstrap.await_framework_quiet(emulator,receipt)
        self.assertEqual(receipt["frameworkPrecondition"]["samples"],2)
        self.assertIsNone(emulator.command_deadline)
    def test_late_fifth_identical_sample_cannot_pass(self):
        emulator=type("QuietEmulator",(),{"log":io.StringIO()})();receipt={};now=[0.0];samples=[0]
        def state(_):
            samples[0]+=1
            if samples[0]==5:now[0]=120.0
            return {"ready":True}
        with patch.object(bootstrap,"drain_framework"),patch.object(bootstrap,"framework_state",side_effect=state),\
             patch.object(bootstrap.time,"monotonic",side_effect=lambda:now[0]),patch.object(bootstrap.time,"sleep"):
            with self.assertRaisesRegex(RuntimeError,"FRAMEWORK_PRECONDITION_DEADLINE"):
                bootstrap.await_framework_quiet(emulator,receipt)
        self.assertEqual(receipt["frameworkPrecondition"]["verdict"],"FAIL_FRAMEWORK_PRECONDITION")
    def test_both_fixture_installs_require_complete_materialization(self):
        class InstallEmulator:
            def __init__(self):self.commands=[]
            def command(self,*arguments):self.commands.append(arguments);return "Performing Push Install\nSuccess\n"
        emulator=InstallEmulator();apks=[Path("public-target.apk"),Path("public-probe.apk")]
        bootstrap.install_fixtures(emulator,apks)
        self.assertEqual(emulator.commands,[("install","--no-incremental","--no-streaming","-r",apk) for apk in apks])
    def test_incremental_response_or_failure_remains_rejected(self):
        for output in ("Performing Incremental Install\nSuccess\n","Failure\n"):
            class InstallEmulator:
                def command(self,*arguments):return output
            with self.subTest(output=output),self.assertRaisesRegex(RuntimeError,"FIXTURE_INSTALL_FAILED"):
                bootstrap.install_fixtures(InstallEmulator(),[Path("public-fixture.apk")])
    def exercise(self,activities,requests):
        emulator=FixtureEmulator(activities);receipt={}
        bootstrap.LocalTripwireListener.requests=requests
        with patch.object(bootstrap.time,"sleep"):
            try: result=bootstrap.positive_control(emulator,receipt)
            except RuntimeError: result=None
        self.assertEqual(sum("start" in command for command in emulator.commands),1)
        return result,receipt
    def test_exact_six_passes(self):
        result,receipt=self.exercise(1,6)
        self.assertEqual(result,6)
        self.assertEqual(receipt["positiveControlObserved"],{"componentWrites":6,"localRequests":6,"applicationConstructions":1,"activityCreates":1})
    def test_seven_is_retained_and_rejected(self):
        result,receipt=self.exercise(2,7)
        self.assertIsNone(result)
        self.assertEqual(receipt["positiveControlObserved"]["componentWrites"],7)
        self.assertEqual(receipt["positiveControlObserved"]["activityCreates"],2)
    def test_wrong_network_count_is_rejected(self):
        result,receipt=self.exercise(1,7)
        self.assertIsNone(result)
        self.assertEqual(receipt["positiveControlObserved"]["localRequests"],7)

if __name__=="__main__":unittest.main()
