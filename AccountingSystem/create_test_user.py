from sqlalchemy.orm import Session
from database import SessionLocal
from models.user import User, Role
from passlib.context import CryptContext

# Setup password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

# Start DB session
db: Session = SessionLocal()

# 🔐 Step 1: Create role "admin" if it doesn't exist
admin_role = db.query(Role).filter_by(name="admin").first()
if not admin_role:
    admin_role = Role(name="admin")
    db.add(admin_role)
    db.commit()
    db.refresh(admin_role)

# 👤 Step 2: Create user if not already there
existing_user = db.query(User).filter_by(username="admin").first()
if not existing_user:
    user = User(
        username="admin",
        hashed_password=get_password_hash("admin123"),
        role_id=admin_role.id
    )
    db.add(user)
    db.commit()
    print("✅ Test user created with username=admin, password=admin123")
else:
    print("ℹ️ User 'admin' already exists.")
