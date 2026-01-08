from sqlalchemy import Column, Integer, Float, Date
from database import Base

class SHIFSetting(Base):
    __tablename__ = "shif_settings"
    id = Column(Integer, primary_key=True, index=True)
    rate = Column(Float, nullable=False)
    cap = Column(Float, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)