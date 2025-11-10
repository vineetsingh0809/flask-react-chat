import { useEffect, useState, useRef } from "react";
import {
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
  Typography,
  TextField,
  Button,
  Stack,
  Paper,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { createSocket } from "../lib/socket";
import API from "../api";

export default function Chat() {
  const username = localStorage.getItem("username");
  const [socket, setSocket] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentRoom, setCurrentRoom] = useState("");
  const [message, setMessage] = useState("");
  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [newRoom, setNewRoom] = useState("");
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);

  const chatEndRef = useRef(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  });

  // Fetch rooms & users
  useEffect(() => {
    API.get("/rooms")
      .then((res) => {
        setRooms(res.data);
        if (res.data.length > 0 && !currentRoom) {
          setCurrentRoom(res.data[0]);
        }
      })
      .catch(console.error);

    API.get("/users")
      .then((res) => setUsers(res.data.filter((u) => u !== username)))
      .catch(console.error);
  }, [currentRoom, username]);

  // Setup socket connection
  useEffect(() => {
    const s = createSocket();
    setSocket(s);

    s.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
      alert("Socket connection failed: " + err.message);
    });

    s.on("receive_message", (data) => {
      setMessagesByRoom((prev) => {
        const msgs = prev[data.room] || [];
        return { ...prev, [data.room]: [...msgs, data] };
      });
    });

    s.on("system_message", (data) => {
      console.log(data);
      setMessagesByRoom((prev) => {
        const msgs = prev[data.room] || [];
        return {
          ...prev,
          [data.room]: [
            ...msgs,
            {
              username: "System",
              text: data.text,
              timestamp: new Date().toISOString(),
              room: data.room,
            },
          ],
        };
      });
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Load messages for selected room
  useEffect(() => {
    if (!currentRoom) return;
    API.get(`/messages/${encodeURIComponent(currentRoom)}`)
      .then((res) => {
        console.log(res);
        setMessagesByRoom((prev) => ({
          ...prev,
          [currentRoom]: res.data,
        }));
        socket?.emit("join_room", { username, room: currentRoom });
      })
      .catch(console.error);
  }, [currentRoom, socket, username]);

  const sendMessage = () => {
    if (!message.trim() || !socket || !currentRoom) return;

    const msgData = {
      username,
      text: message.trim(),
      room: currentRoom,
      timestamp: new Date().toISOString(),
    };

    socket.emit("send_message", msgData);
    // setMessagesByRoom((prev) => ({
    //   ...prev,
    //   [currentRoom]: [...(prev[currentRoom] || []), msgData],
    // }));
    setMessage("");
  };

  const handleAddRoom = async () => {
    if (!newRoom.trim()) return alert("Enter a room name!");
    try {
      const res = await API.post("/rooms", { name: newRoom });
      setRooms((prev) => [...prev, res.data.name]);
      setNewRoom("");
      setRoomDialogOpen(false);
    } catch (err) {
      console.log(err);
      alert("Room already exists!");
    }
  };

  const startDM = async (otherUser) => {
    const dmRoom = `dm:${[username, otherUser].sort().join(":")}`;
    setCurrentRoom(dmRoom);
    if (!rooms.includes(dmRoom)) setRooms((prev) => [...prev, dmRoom]);

    try {
      const res = await API.get(`/messages/${encodeURIComponent(dmRoom)}`);
      setMessagesByRoom((prev) => ({ ...prev, [dmRoom]: res.data }));
      socket?.emit("join_room", { username, room: dmRoom });
    } catch (err) {
      console.error("DM fetch error:", err);
    }
  };

  const currentMessages = messagesByRoom[currentRoom] || [];

  return (
    <Box display="flex" height="100vh" bgcolor="#eaeff1">
      {/* Sidebar */}
      <Paper
        elevation={3}
        sx={{
          width: 270,
          p: 2,
          display: "flex",
          flexDirection: "column",
          bgcolor: "#ffffff",
          borderRight: "1px solid #dcdcdc",
        }}
      >
        <Typography
          variant="h6"
          fontWeight="bold"
          color="primary"
          textAlign="center"
          mb={2}
        >
          {username}'s Chat
        </Typography>

        <Typography variant="subtitle2" color="gray">
          Rooms
        </Typography>
        <List dense sx={{ flexGrow: 1, overflowY: "auto" }}>
          {rooms.map((room) => (
            <ListItem
              key={room}
              button
              selected={room === currentRoom}
              onClick={() => setCurrentRoom(room)}
              sx={{
                borderRadius: 1,
                "&.Mui-selected": {
                  bgcolor: "primary.light",
                  color: "white",
                },
                backgroundColor: room === currentRoom ? "#dcdcdc" : "#ffffff",
                cursor: "pointer",
              }}
            >
              <ListItemText primary={room.replace("dm:", "")} />
            </ListItem>
          ))}
        </List>

        <Divider sx={{ my: 1 }} />

        <Typography variant="subtitle2" color="gray">
          Direct Messages
        </Typography>
        <List dense sx={{ flexGrow: 1, overflowY: "auto" }}>
          {users.map((user) => (
            <ListItem
              key={user}
              button
              onClick={() => startDM(user)}
              sx={{ borderRadius: 1 }}
            >
              <ListItemText primary={user} />
            </ListItem>
          ))}
        </List>

        <Button
          variant="outlined"
          fullWidth
          onClick={() => setRoomDialogOpen(true)}
        >
          + New Room
        </Button>
      </Paper>

      {/* Chat Area */}
      <Box
        flex={1}
        display="flex"
        flexDirection="column"
        p={2}
        bgcolor="#dfe6e9"
      >
        <Typography variant="h6" mb={1}>
          {currentRoom ? currentRoom.replace("dm:", "") : "Select a room"}
        </Typography>
        <Divider />

        {/* Chat messages */}
        <Box
          flex={1}
          overflow="auto"
          p={2}
          sx={{
            backgroundColor: "#f9f9f9",
            borderRadius: 1,
            boxShadow: 1,
            mb: 1,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {currentMessages.map((m, i) => {
            const isMine = m.username === username;
            const utcDate = new Date(m.timestamp);
            const istDate = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000); // add 5.5 hours

            const time = istDate.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            });

            console.log(time);

            return (
              <Box
                key={i}
                sx={{
                  alignSelf: isMine ? "flex-end" : "flex-start",
                  backgroundColor: isMine ? "#dcf8c6" : "#ffffff",
                  color: "#000",
                  borderRadius: "12px",
                  px: 1.5,
                  py: 1,
                  mb: 1,
                  maxWidth: "70%",
                  boxShadow: 1,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 500, color: "#555" }}
                >
                  {m.username}
                </Typography>
                <Typography variant="body2">{m.text}</Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    textAlign: "right",
                    color: "gray",
                    mt: 0.5,
                    fontSize: "0.7rem",
                  }}
                >
                  {time}
                </Typography>
              </Box>
            );
          })}
          <div ref={chatEndRef} />
        </Box>

        {/* Input area */}
        {currentRoom && (
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
            />
            <Button variant="contained" onClick={sendMessage}>
              Send
            </Button>
          </Stack>
        )}
      </Box>

      {/* Add Room Dialog */}
      <Dialog open={roomDialogOpen} onClose={() => setRoomDialogOpen(false)}>
        <DialogTitle>Create New Room</DialogTitle>
        <DialogContent>
          <TextField
            label="Room Name"
            fullWidth
            margin="dense"
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoomDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddRoom} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
