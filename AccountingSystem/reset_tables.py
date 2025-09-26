from database import engine
from models import employee, payroll

employee.Base.metadata.drop_all(bind=engine)
payroll.Base.metadata.drop_all(bind=engine)

employee.Base.metadata.create_all(bind=engine)
payroll.Base.metadata.create_all(bind=engine)
