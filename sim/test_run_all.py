import subprocess
import sys


def test_run_all_outputs_all_sections():
    out = subprocess.run([sys.executable, "-m", "sim.run_all"], capture_output=True, text=True, check=True).stdout
    for tag in ("S1", "S2", "S3", "S4", "S5", "S6", "S7"):
        assert f"### {tag} " in out
