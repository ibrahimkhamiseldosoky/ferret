from pydantic import BaseModel
from typing import Optional


class User(BaseModel):
    name: str
    email: str
    password_hash: str
    role: str = "user"


class Order(BaseModel):
    user_id: str
    product: str
    amount: float
    status: str = "pending"


class Product(BaseModel):
    name: str
    price: float
    description: Optional[str] = None
    stock: int = 0
