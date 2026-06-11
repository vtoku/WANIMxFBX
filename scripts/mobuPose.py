# Dump evaluated global rotation matrices for chain-end bones at fixed times.
# Compare against node-side ground truth from the source quaternions.
import os
import sys

import pyfbsdk

if hasattr(pyfbsdk, "initialize") and not hasattr(pyfbsdk, "FBApplication"):
    pyfbsdk.initialize()

from pyfbsdk import (
    FBApplication, FBSystem, FBModelSkeleton, FBMatrix, FBTime,
    FBModelTransformationType, FBPlayerControl,
)

here = os.path.dirname(os.path.abspath(__file__))
path = os.environ.get("WANIM_FBX") or os.path.join(here, "full.fbx")
OUT = os.path.join(here, "mobu-pose.txt")

app = FBApplication()
app.FileOpen(path, False)
system = FBSystem()
scene = system.Scene

bones = {}
for comp in scene.Components:
    if isinstance(comp, FBModelSkeleton):
        bones[comp.Name] = comp

system.CurrentTake = scene.Takes[0]
player = FBPlayerControl()

lines = []
for seconds in (0.0, 3.0):
    t = FBTime(0, 0, 0, 0)
    t.SetSecondDouble(seconds)
    player.Goto(t)
    scene.Evaluate()
    for name in ("Head", "RightHand", "LeftHand", "Hips"):
        b = bones.get(name)
        if b is None:
            continue
        m = FBMatrix()
        b.GetMatrix(m, FBModelTransformationType.kModelTransformation, True)
        row = [m[i] for i in range(16)]
        lines.append("%s t=%.1f %s" % (name, seconds, " ".join("%.5f" % v for v in row)))

with open(OUT, "w") as f:
    f.write("\n".join(lines) + "\n")
print("\n".join(lines))
app.FileExit()
