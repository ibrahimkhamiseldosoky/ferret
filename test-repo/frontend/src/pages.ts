import { LoginForm, UserList, ProductGrid } from "./components";
import { getUsers, getProducts } from "./api";

export function LoginPage() {
  return (
    <div>
      <h1>Login</h1>
      <LoginForm />
    </div>
  );
}

export function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <UserList />
      <ProductGrid />
    </div>
  );
}

export async function loadDashboard() {
  const [users, products] = await Promise.all([
    getUsers(),
    getProducts(),
  ]);
  return { users, products };
}
