"""Fresh-clone bootstrap for rp-standalone."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Callable, Sequence

MIN_PYTHON = (3, 11)
REQUIREMENTS = "requirements.txt"
DEFAULT_CONFIG = Path("backend") / "config.default.yaml"
CONFIG = Path("backend") / "config.yaml"
_INCOMPLETE_MARKER = ".rp-bootstrap-incomplete"
_COMPLETE_MARKER = ".rp-bootstrap-complete"


def venv_python_path(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def require_supported_python(version_info: Sequence[int] | None = None) -> None:
    version = tuple(version_info or sys.version_info)
    if version[:2] < MIN_PYTHON:
        required = ".".join(map(str, MIN_PYTHON))
        actual = ".".join(map(str, version[:3]))
        raise RuntimeError(f"Python {required}+ is required (found {actual})")


def ensure_config(repo_root: Path) -> Path:
    default_path = repo_root / DEFAULT_CONFIG
    config_path = repo_root / CONFIG
    if config_path.exists():
        if not config_path.is_file():
            raise RuntimeError(f"config path is not a file: {config_path}")
        if config_path.stat().st_size == 0:
            raise RuntimeError(
                f"config is empty and was not overwritten: {config_path}. "
                f"Restore it manually from {default_path}."
            )
        print(f"[bootstrap] config exists, keeping it unchanged: {config_path}")
        return config_path

    if not default_path.is_file():
        raise RuntimeError(f"default config not found: {default_path}")

    config_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"[bootstrap] creating config: {config_path}")
    data = default_path.read_bytes()
    try:
        with config_path.open("xb") as handle:
            handle.write(data)
    except FileExistsError:
        print(f"[bootstrap] config appeared concurrently, keeping it unchanged: {config_path}")
    return config_path


def _clean_subprocess_env() -> dict[str, str]:
    """Return an environment that cannot inherit another Python installation."""
    env = os.environ.copy()
    env.pop("PYTHONPATH", None)
    env.pop("PYTHONHOME", None)
    return env


_DEPENDENCY_CHECK_CODE = r"""
import json
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from packaging.requirements import Requirement

missing = []
mismatches = []
for raw_line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#"):
        continue
    requirement = Requirement(line)
    try:
        installed = version(requirement.name)
    except PackageNotFoundError:
        missing.append({"requirement": str(requirement)})
        continue
    if requirement.specifier and installed not in requirement.specifier:
        mismatches.append({
            "requirement": str(requirement),
            "installed": installed,
        })
print(json.dumps({
    "ok": not missing and not mismatches,
    "missing": missing,
    "mismatches": mismatches,
    "error": "",
}))
"""


def check_venv_dependencies(
    repo_root: Path,
    venv_python: Path,
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> dict:
    """Read installed metadata from the dedicated venv without changing it."""
    requirements = repo_root / REQUIREMENTS
    if not requirements.is_file():
        return {"ok": False, "missing": [], "mismatches": [],
                "error": f"requirements not found: {requirements}"}
    try:
        result = runner(
            [str(venv_python), "-c", _DEPENDENCY_CHECK_CODE, str(requirements)],
            check=False,
            capture_output=True,
            text=True,
            env=_clean_subprocess_env(),
            cwd=str(repo_root),
            timeout=10,
        )
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "unknown error").strip()
            return {"ok": False, "missing": [], "mismatches": [],
                    "error": detail}
        payload = json.loads(result.stdout)
        if not isinstance(payload, dict) or not isinstance(payload.get("ok"), bool):
            raise ValueError("dependency check returned an invalid payload")
        return payload
    except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        return {"ok": False, "missing": [], "mismatches": [],
                "error": str(exc)}


def _repair_command(
    repo_root: Path,
    venv_python: Path,
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> str:
    requirements = repo_root / REQUIREMENTS
    env = _clean_subprocess_env()
    try:
        pip_probe = runner(
            [str(venv_python), "-m", "pip", "--version"],
            check=False,
            capture_output=True,
            text=True,
            env=env,
            cwd=str(repo_root),
            timeout=10,
        )
        if pip_probe.returncode == 0:
            return f'"{venv_python}" -m pip install -r "{requirements}"'
    except (OSError, subprocess.TimeoutExpired):
        pass
    if shutil.which("uv"):
        return f'uv pip install --python "{venv_python}" -r "{requirements}"'
    return "Rebuild the dedicated .venv manually; see README Quick Start."


def warn_if_dependency_drift(
    repo_root: Path,
    venv_python: Path,
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
) -> None:
    """Warn about dependency drift without blocking startup or mutating the venv."""
    result = check_venv_dependencies(repo_root, venv_python, runner=runner)
    if result.get("ok"):
        return
    error = result.get("error", "")
    if error:
        print(f"[bootstrap] WARNING: dependency check failed: {error}")
    for item in result.get("missing", []):
        print(f"[bootstrap] WARNING: missing dependency: {item.get('requirement', '?')}")
    for item in result.get("mismatches", []):
        print(
            "[bootstrap] WARNING: dependency mismatch: "
            f"{item.get('requirement', '?')} (installed {item.get('installed', '?')})"
        )
    print(f"[bootstrap] Repair: {_repair_command(repo_root, venv_python, runner=runner)}")


def ensure_venv(
    repo_root: Path,
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
    executable: str | None = None,
) -> Path:
    venv_dir = repo_root / ".venv"
    venv_python = venv_python_path(venv_dir)
    incomplete = venv_dir / _INCOMPLETE_MARKER
    complete = venv_dir / _COMPLETE_MARKER
    install_required = False

    if venv_dir.exists():
        if not venv_dir.is_dir() or not venv_python.is_file():
            raise RuntimeError(f"existing .venv is incomplete: {venv_dir}")
        if incomplete.exists():
            print("[bootstrap] retrying interrupted dependency installation")
            install_required = True
        else:
            print(f"[bootstrap] .venv exists, keeping it unchanged: {venv_dir}")
    else:
        print(f"[bootstrap] creating virtual environment: {venv_dir}")
        runner(
            [executable or sys.executable, "-m", "venv", str(venv_dir)],
            check=True,
        )
        if not venv_python.is_file():
            raise RuntimeError(f"venv creation did not produce Python: {venv_python}")
        incomplete.write_text("dependency installation pending\n", encoding="utf-8")
        install_required = True

    if install_required:
        requirements = repo_root / REQUIREMENTS
        if not requirements.is_file():
            raise RuntimeError(f"requirements not found: {requirements}")
        print("[bootstrap] installing dependencies (first run may take several minutes)")
        runner(
            [str(venv_python), "-m", "pip", "install", "-r", str(requirements)],
            check=True,
        )
        complete.write_text("ready\n", encoding="utf-8")
        incomplete.unlink(missing_ok=True)
        print("[bootstrap] dependency installation complete")

    return venv_python


def bootstrap(
    repo_root: Path | None = None,
    runner: Callable[..., subprocess.CompletedProcess] = subprocess.run,
    executable: str | None = None,
) -> Path:
    require_supported_python()
    root = (repo_root or Path(__file__).resolve().parent).resolve()
    venv_python = ensure_venv(root, runner=runner, executable=executable)
    ensure_config(root)
    warn_if_dependency_drift(root, venv_python, runner=runner)
    return venv_python


def main() -> int:
    try:
        bootstrap()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"[bootstrap] ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())