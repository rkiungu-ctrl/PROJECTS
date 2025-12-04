def to_bool(v, default=True):
    """Normalize various truthy/falsy representations to a Python bool.

    Accepts bool, int/float, and common strings like 'true','false','1','0','yes','no','on','off'.
    If v is None, returns the provided default.
    """
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    if isinstance(v, str):
        s = v.strip().lower()
        if s in {"1", "true", "yes", "on"}:
            return True
        if s in {"0", "false", "no", "off"}:
            return False
        # fall back to default for unrecognized strings
        return default
    return default
