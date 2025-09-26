from fastapi import FastAPI
from routes import customer_import

app = FastAPI()

app.include_router(customer_import.router)

