import { useState } from "react";
import API from "../api";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  Link,
} from "@mui/material";

export default function Auth() {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const nav = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (isSignup) {
        await API.post("/signup", { username, password });
        alert("Signup successful! Please login now.");
        setIsSignup(false);
      } else {
        const res = await API.post("/login", { username, password });
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("username", res.data.username);
        nav("/chat");
      }
    } catch (err) {
      alert(
        isSignup
          ? "Signup failed — user might already exist."
          : "Invalid credentials."
      );
      console.log(err)
    }
  }

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      height="100vh"
    >
      <Card sx={{ width: 380, p: 3, boxShadow: 4 }}>
        <CardContent>
          <Typography variant="h5" textAlign="center" mb={2}>
            {isSignup ? "Create an account" : "Welcome back"}
          </Typography>

          <Stack spacing={2} component="form" onSubmit={handleSubmit}>
            <TextField
              label="Username"
              fullWidth
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button variant="contained" type="submit" fullWidth>
              {isSignup ? "Sign Up" : "Login"}
            </Button>
          </Stack>

          <Typography variant="body2" mt={2} textAlign="center">
            {isSignup ? (
              <>
                Already have an account?{" "}
                <Link
                  sx={{ cursor: "pointer" }}
                  onClick={() => setIsSignup(false)}
                >
                  Login
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link
                  sx={{ cursor: "pointer" }}
                  onClick={() => setIsSignup(true)}
                >
                  Sign Up
                </Link>
              </>
            )}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
