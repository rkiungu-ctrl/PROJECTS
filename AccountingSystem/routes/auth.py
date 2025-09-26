from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets
from sqlalchemy.orm import Session
from database import get_db
from models.user import User

security = HTTPBasic()

def simple_auth(credentials: HTTPBasicCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    user = db.query(User).filter(User.username == credentials.username).first()
    
    # ✅ Allow login if password is missing (during transition)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    
    # Password is optional only if hashed_password is null
    if user.hashed_password:
        if not secrets.compare_digest(user.hashed_password, credentials.password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password",
            )

    return user
