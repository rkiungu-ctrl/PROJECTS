"""
Date formatting utilities for consistent date display across the application
"""
from datetime import date, datetime
from typing import Union, Optional


def format_date_ddmmyyyy(date_value: Union[date, datetime, str, None]) -> str:
    """
    Format a date to DD-MM-YYYY format for display.
    
    Args:
        date_value: Date object, datetime object, or ISO date string
        
    Returns:
        Date formatted as DD-MM-YYYY or empty string if invalid
    """
    if not date_value:
        return ""
    
    try:
        if isinstance(date_value, str):
            # Parse ISO date string
            date_obj = datetime.fromisoformat(date_value).date()
        elif isinstance(date_value, datetime):
            date_obj = date_value.date()
        elif isinstance(date_value, date):
            date_obj = date_value
        else:
            return ""
            
        return date_obj.strftime("%d-%m-%Y")
    except (ValueError, AttributeError):
        return ""


def format_date_ddmmyyyy_slash(date_value: Union[date, datetime, str, None]) -> str:
    """
    Format a date to DD/MM/YYYY format for display.
    
    Args:
        date_value: Date object, datetime object, or ISO date string
        
    Returns:
        Date formatted as DD/MM/YYYY or empty string if invalid
    """
    if not date_value:
        return ""
    
    try:
        if isinstance(date_value, str):
            # Parse ISO date string
            date_obj = datetime.fromisoformat(date_value).date()
        elif isinstance(date_value, datetime):
            date_obj = date_value.date()
        elif isinstance(date_value, date):
            date_obj = date_value
        else:
            return ""
            
        return date_obj.strftime("%d/%m/%Y")
    except (ValueError, AttributeError):
        return ""


def parse_display_date(date_str: str) -> Optional[date]:
    """
    Parse a date from DD-MM-YYYY or DD/MM/YYYY format.
    
    Args:
        date_str: Date string in DD-MM-YYYY or DD/MM/YYYY format
        
    Returns:
        Date object or None if parsing fails
    """
    if not date_str:
        return None
        
    date_str = date_str.strip()
    if not date_str:
        return None
    
    # Try DD-MM-YYYY format first
    try:
        return datetime.strptime(date_str, "%d-%m-%Y").date()
    except ValueError:
        pass
    
    # Try DD/MM/YYYY format
    try:
        return datetime.strptime(date_str, "%d/%m/%Y").date()
    except ValueError:
        pass
    
    return None


class DateFormatterMixin:
    """
    Mixin class to add date formatting methods to Pydantic models.
    """
    
    def format_date_field(self, field_name: str, format_type: str = "dash") -> str:
        """
        Format a date field for display.
        
        Args:
            field_name: Name of the date field
            format_type: "dash" for DD-MM-YYYY, "slash" for DD/MM/YYYY
            
        Returns:
            Formatted date string
        """
        date_value = getattr(self, field_name, None)
        if format_type == "slash":
            return format_date_ddmmyyyy_slash(date_value)
        else:
            return format_date_ddmmyyyy(date_value)


# Alias for a single, consistent display formatter used across the app.
# Default display format: DD-MM-YYYY (dash-separated)
format_display_date = format_date_ddmmyyyy