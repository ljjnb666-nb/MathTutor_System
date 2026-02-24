#!/usr/bin/env python3
"""
将当前项目（家教目录）打包为 ZIP 并保存到桌面。
排除：node_modules、venv/.venv、__pycache__、.git、dist/build、
.env、.cursor、.idea、.vscode、.DS_Store、.pytest_cache、.mypy_cache、
htmlcov、vector_store（Chroma 向量库）、*.egg-info 目录、已有备份 zip；
并跳过 .coverage、*.sqlite3 等无需备份的文件。
"""
import os
import zipfile
from datetime import datetime
from pathlib import Path

# 需要排除的目录/文件名（小写比较，兼容不同系统）
EXCLUDE_NAMES = frozenset({
    "node_modules",
    "venv",
    ".venv",
    "__pycache__",
    ".git",
    "dist",
    "build",
    ".env",           # 避免把含密钥的 .env 打进包
    ".cursor",
    ".idea",
    ".vscode",
    ".ds_store",
    ".pytest_cache",
    ".mypy_cache",
    "htmlcov",        # pytest-cov 报告目录
    "vector_store",   # Chroma 向量库，体积大且可重建
})


def get_desktop_path() -> Path:
    """根据操作系统返回桌面路径。"""
    home = Path.home()
    if os.name == "nt":  # Windows
        desktop = home / "Desktop"
    else:  # Mac / Linux
        desktop = home / "Desktop"
    return desktop


def should_exclude(entry_name: str) -> bool:
    """判断该目录/文件名是否应被排除。"""
    lower = entry_name.lower()
    if lower in EXCLUDE_NAMES:
        return True
    if lower.endswith(".egg-info"):
        return True
    return False


def should_skip_file(name: str, project_root: Path, root_path: Path) -> bool:
    """判断该文件是否应跳过不打包。"""
    lower = name.lower()
    if lower == ".ds_store":
        return True
    if lower == ".env":
        return True
    if lower == ".coverage":
        return True
    # 跳过任意路径下的已有备份 zip（避免把旧备份打进新备份）
    if lower.endswith(".zip") and "mathtutor_backup_" in lower:
        return True
    # 跳过 SQLite 数据库（math_tutor.db、chroma 等），体积大且可重建
    if lower.endswith(".sqlite3") or lower.endswith(".db"):
        return True
    return False


def main() -> None:
    project_root = Path(__file__).resolve().parent
    desktop = get_desktop_path()
    desktop.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_name = f"MathTutor_Backup_{timestamp}.zip"
    zip_path = desktop / zip_name

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(project_root, topdown=True):
            root_path = Path(root)
            # 不进入被排除的目录
            dirs[:] = [d for d in dirs if not should_exclude(d)]
            # 跳过当前正在生成的 zip（防止同目录运行时误包）
            if root_path == project_root and zip_name in files:
                files = [f for f in files if f != zip_name]
            for name in files:
                if should_skip_file(name, project_root, root_path):
                    continue
                file_path = root_path / name
                try:
                    arcname = file_path.relative_to(project_root)
                except ValueError:
                    continue
                print(arcname)
                zf.write(file_path, arcname)

    print(f"备份成功: {zip_path}")


if __name__ == "__main__":
    main()
