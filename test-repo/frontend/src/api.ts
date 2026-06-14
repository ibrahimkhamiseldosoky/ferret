import type { User, Product, Order } from "../shared/types";

const API = "http://localhost:8000/api";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  return res.json();
}

export async function login(email: string, password: string) {
  return fetchApi<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getUsers() {
  return fetchApi<User[]>("/users");
}

export async function getProducts() {
  return fetchApi<Product[]>("/products");
}

export async function createOrder(order: Partial<Order>) {
  return fetchApi<Order>("/orders", {
    method: "POST",
    body: JSON.stringify(order),
  });
}
