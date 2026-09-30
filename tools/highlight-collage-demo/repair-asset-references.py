"""Rebuild the two contaminated experimental references in an isolated directory."""
from pathlib import Path
import importlib.util
path=Path(__file__).with_name('vivid-gallery.py')
spec=importlib.util.spec_from_file_location('vivid',path)
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
v.OUT=v.r.O/'glossy-lab/fixed-assets-v1/reference-repair'
v.OUT.mkdir(parents=True,exist_ok=True)
v.install();v.prepare(['3895','3903'])
