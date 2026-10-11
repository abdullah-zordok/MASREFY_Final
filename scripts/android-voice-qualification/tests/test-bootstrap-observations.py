"""Exercise synthetic control accounting without contacting a device."""
import importlib.util
from pathlib import Path
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
