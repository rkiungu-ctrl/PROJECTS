from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.user import User
from schemas.user import UserCreate, UserOut

router = APIRouter(
    tags=["Users"]
)

# ------------------ USERS ------------------

@router.post("/users/", response_model=UserOut)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    new_user = User(username=user.username, role=user.role)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/users/", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@router.delete("/users/{username}")
def delete_user(username: str, db: Session = Depends(get_db)):
    user_obj = db.query(User).filter(User.username == username).first()
    if not user_obj:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user_obj)
    db.commit()
    return {"detail": "User deleted"}
