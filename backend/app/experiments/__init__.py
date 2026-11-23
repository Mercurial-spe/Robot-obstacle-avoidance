"""Headless batch experiments: runner, aggregation, CSV/JSON export.

Nothing in this package may import FastAPI — batch experiments must be
runnable from plain Python scripts and pytest without the server.
"""
