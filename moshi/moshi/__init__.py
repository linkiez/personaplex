# Copyright (c) Kyutai, all rights reserved.
# This source code is licensed under the license found in the
# LICENSE file in the root directory of this source tree.

"""
moshi is the inference codebase for Kyutai audio generation models.

The code has been adapted from Audiocraft, see LICENSE.audiocraft
  Copyright (c) Meta Platforms, Inc. and affiliates.
"""

__version__ = "0.1.0"

__all__ = [
  "utils",
  "modules",
  "models",
  "quantization",
  "__version__",
]


def __getattr__(name: str):
  """Lazily import package submodules to keep lightweight imports cheap."""
  if name in {"utils", "modules", "models", "quantization"}:
    import importlib

    module = importlib.import_module(f"{__name__}.{name}")
    globals()[name] = module
    return module
  raise AttributeError(f"module '{__name__}' has no attribute '{name}'")
