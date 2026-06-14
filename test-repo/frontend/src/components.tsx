import React, { useState, useEffect } from "react";
import { login, getUsers, getProducts } from "./api";
import type { User, Product } from "../shared/types";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(email, password);
    localStorage.setItem("token", result.token);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit">Login</button>
    </form>
  );
}

export function UserList() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    getUsers().then(setUsers);
  }, []);

  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}>
          {u.name} - {u.email}
        </li>
      ))}
    </ul>
  );
}

export function ProductGrid() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    getProducts().then(setProducts);
  }, []);

  return (
    <div className="grid">
      {products.map((p) => (
        <div key={p.id}>
          <h3>{p.name}</h3>
          <p>${p.price}</p>
        </div>
      ))}
    </div>
  );
}
