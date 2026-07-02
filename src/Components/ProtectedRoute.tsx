import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../Utils/firebase";
import { Navigate, Outlet } from "react-router-dom";

export default () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /* Check if the Current User is Logged In */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /* If We're Loading - Show Loading Screen */
  if (loading) {
    return (
      <main>
        <div></div>
      </main>
    );
  }

  /* Outlet shows the child  */
  return user ? <Outlet /> : <Navigate to="/SignIn" replace />;
};
