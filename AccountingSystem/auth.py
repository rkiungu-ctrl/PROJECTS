from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from typing import List
import secrets

security = HTTPBasic()

# Dummy user store
users_db = {
    "admin": {"username": "admin", "password": "admin", "roles": ["admin", "accountant"]},
    "staff": {"username": "staff", "password": "staff", "roles": ["inventory", "acquisitions"]},
}

def simple_auth(credentials: HTTPBasicCredentials = Depends(security)):
    user = users_db.get(credentials.username)
    correct_password = user and secrets.compare_digest(credentials.password, user["password"])
    if not user or not correct_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return user

def require_roles(*required_roles: List[str]):
    def role_checker(user: dict = Depends(simple_auth)):
        if not any(role in user["roles"] for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource"
            )
        return user
    return role_checker
