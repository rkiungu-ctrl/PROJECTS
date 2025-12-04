"""
Date parsing utilities for import functions
"""
import datetime as dt
from typing import Optional


def parse_import_date(date_str: str) -> Optional[dt.date]:
    """
    Parse date from import files with multiple format support.
    
    Args:
        date_str: Date string from CSV import
        
    Returns:
        Parsed date object or None if parsing fails
        
    Supported formats:
        - YYYY-MM-DD (ISO format)
        - DD/MM/YYYY (European format)  
        - DD-MM-YYYY (European format with dashes)
        - MM/DD/YYYY (US format)
        - DD Mon YYYY (e.g., "15 Jan 2024")
    """
    if not date_str:
        return None
        
    date_str = date_str.strip()
    if not date_str:
        return None
    
    # Try different date formats
    formats = [
        "%Y-%m-%d",      # 2024-01-15
        "%d/%m/%Y",      # 15/01/2024
        "%d-%m-%Y",      # 15-01-2024
        "%m/%d/%Y",      # 01/15/2024
        "%d %b %Y",      # 15 Jan 2024
        "%d %B %Y",      # 15 January 2024
    ]
    
    for fmt in formats:
        try:
            return dt.datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    
    # Try ISO format parsing as last resort
    try:
        return dt.date.fromisoformat(date_str)
    except ValueError:
        return None


def validate_import_date(date_str: str, row_identifier: str = "") -> dt.date:
    """
    Parse and validate date from import, raising descriptive error if invalid.
    
    Args:
        date_str: Date string from CSV
        row_identifier: Identifier for error messages (e.g., "Row 5", "Invoice INV001")
        
    Returns:
        Parsed date object
        
    Raises:
        ValueError: If date cannot be parsed with descriptive message
    """
    parsed_date = parse_import_date(date_str)
    if parsed_date is None:
        supported_formats = [
            "YYYY-MM-DD (2024-01-15)",
            "DD/MM/YYYY (15/01/2024)", 
            "DD-MM-YYYY (15-01-2024)",
            "MM/DD/YYYY (01/15/2024)",
            "DD Mon YYYY (15 Jan 2024)"
        ]
        raise ValueError(
            f"{row_identifier}: Invalid date '{date_str}'. "
            f"Supported formats: {', '.join(supported_formats)}"
        )
    
    return parsed_date