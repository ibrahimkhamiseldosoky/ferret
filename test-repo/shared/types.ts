export interface User {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description?: string;
  stock: number;
}

export interface Order {
  id: string;
  user_id: string;
  product_id: string;
  amount: number;
  status: "pending" | "shipped" | "delivered";
  created_at: string;
}
