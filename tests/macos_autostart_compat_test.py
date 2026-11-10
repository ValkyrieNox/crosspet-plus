"""Run the real Python auto-start function without launching any application."""
import ast
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock


class MacAutoStartCompatibility(unittest.TestCase):
    def test_native_variant_selection_and_legacy_fallback(self):
        source = Path(__file__).resolve().parents[1] / "integrations/crosspet-hook.py"
        tree = ast.parse(source.read_text())
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "ensure_pet")
        module = ast.Module(body=[function], type_ignores=[])
        for marker, expected in [(None, "io.github.crosspet"), ("com.valkyrienox.crosspet-plus.native", "com.valkyrienox.crosspet-plus.native"), ("invalid.other-app", "io.github.crosspet")]:
            with self.subTest(marker=marker), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                if marker is not None:
                    (root / "native-bundle-id").write_text(marker)
                scope = dict(app_data=root, state_dir=root / "state", os=os, time=time)
                exec(compile(module, str(source), "exec"), scope)
                with mock.patch("subprocess.Popen") as launch:
                    scope["ensure_pet"]()
                    self.assertEqual(launch.call_args.args[0][-1], expected)


if __name__ == "__main__":
    unittest.main()
