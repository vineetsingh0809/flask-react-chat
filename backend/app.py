# backend/app.py
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, emit
from flask_jwt_extended import JWTManager, create_access_token, decode_token
from datetime import datetime, timezone
from collections import defaultdict
import os

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "super-secret")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL", "sqlite:///db.sqlite3")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "jwt-secret")

db = SQLAlchemy(app)
CORS(app, supports_credentials=True)
socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)
jwt = JWTManager(app)


# --------- Models ----------
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)  # use hashing in prod

class Room(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    room_name = db.Column(db.String(200), nullable=False)   # stores room or dm name
    username = db.Column(db.String(80), nullable=False)
    text = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


# --------- DB Init ----------
with app.app_context():
    db.create_all()
    # default rooms
    for r in ["General", "Developers", "Support"]:
        if not Room.query.filter_by(name=r).first():
            db.session.add(Room(name=r))
    db.session.commit()


# --------- Helpers ----------
def decode_jwt_identity(token: str):
    """Return identity (username) from JWT token or None."""
    try:
        payload = decode_token(token)
        return payload.get("sub")  # create_access_token stores identity in 'sub'
    except Exception:
        return None

def canonical_dm(a: str, b: str):
    a, b = sorted([a, b])
    return f"dm:{a}:{b}"


# --------- HTTP routes ----------
@app.route("/signup", methods=["POST"])
def signup():
    data = request.json or {}
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "username and password required"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "user exists"}), 400
    user = User(username=username, password=password)
    db.session.add(user)
    db.session.commit()
    token = create_access_token(identity=user.username)
    return jsonify({"username": user.username, "token": token}), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    username = data.get("username")
    password = data.get("password")
    user = User.query.filter_by(username=username, password=password).first()
    if not user:
        return jsonify({"error": "invalid credentials"}), 401
    token = create_access_token(identity=user.username)
    return jsonify({"username": user.username, "access_token": token}), 200


@app.route("/users", methods=["GET"])
def list_users():
    users = User.query.order_by(User.username.asc()).all()
    return jsonify([u.username for u in users])


@app.route("/rooms", methods=["GET"])
def get_rooms():
    rooms = Room.query.order_by(Room.name.asc()).all()
    return jsonify([r.name for r in rooms])


@app.route("/rooms", methods=["POST"])
def create_room():
    data = request.json or {}
    name = data.get("name")
    if not name:
        return jsonify({"error": "name required"}), 400
    if Room.query.filter_by(name=name).first():
        return jsonify({"error": "room exists"}), 400
    room = Room(name=name)
    db.session.add(room)
    db.session.commit()
    return jsonify({"name": room.name}), 201


@app.route("/messages/<room_name>", methods=["GET"])
def get_messages(room_name):
    msgs = Message.query.filter_by(room_name=room_name).order_by(Message.timestamp.asc()).all()
    return jsonify([
        {
            "username": m.username,
            "text": m.text,
            "timestamp": m.timestamp.isoformat(),
            "room": m.room_name
        } for m in msgs
    ])


@app.route("/dm_room/<other_user>", methods=["GET"])
def get_dm_room(other_user):
    # expects token as query param ?token=...
    token = request.args.get("token")
    me = decode_jwt_identity(token) if token else None
    if not me:
        return jsonify({"error": "token required"}), 401
    if not User.query.filter_by(username=other_user).first():
        return jsonify({"error": "user not found"}), 404
    room = canonical_dm(me, other_user)
    return jsonify({"room": room})


# --------- Socket.IO (JWT-secured) ----------
sid_to_user = {}
user_to_sids = defaultdict(set)


@socketio.on("connect")
def on_connect(auth):
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")
    username = decode_jwt_identity(token) if token else None
    if not username:
        print("socket connect rejected (no/invalid token)")
        return False
    sid = request.sid
    sid_to_user[sid] = username
    user_to_sids[username].add(sid)
    print(f"[connect] {username} connected (sid={sid})")


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    username = sid_to_user.get(sid)
    if username:
        user_to_sids[username].discard(sid)
        if not user_to_sids[username]:
            user_to_sids.pop(username, None)
        sid_to_user.pop(sid, None)
        print(f"[disconnect] {username} disconnected (sid={sid})")


@socketio.on("join_room")
def on_join(data):
    sid = request.sid
    username = sid_to_user.get(sid)
    if not username:
        emit("error", {"msg": "not authorized"}, to=sid)
        return

    room = data.get("room")
    if not room:
        return

    # Validate DM membership
    if room.startswith("dm:"):
        parts = room.split(":")
        if len(parts) != 3 or username not in parts[1:]:
            emit("error", {"msg": "not authorized for this DM"}, to=sid)
            return

    join_room(room)
    print(f"{username} joined {room}")


@socketio.on("leave_room")
def on_leave(data):
    sid = request.sid
    username = sid_to_user.get(sid)
    room = data.get("room")
    if username and room:
        leave_room(room)
        print(f"{username} left {room}")


@socketio.on("send_message")
def on_send(data):
    sid = request.sid
    username = sid_to_user.get(sid)
    if not username:
        emit("error", {"msg": "not authorized"}, to=sid)
        return

    text = data.get("text", "").strip()
    room = data.get("room")
    if not text or not room:
        return

    # Validate DM membership again
    if room.startswith("dm:"):
        parts = room.split(":")
        if len(parts) != 3 or username not in parts[1:]:
            emit("error", {"msg": "not allowed to send in this DM"}, to=sid)
            return

    # Save message and broadcast
    msg = Message(room_name=room, username=username, text=text)
    db.session.add(msg)
    db.session.commit()

    payload = {
        "username": username,
        "text": text,
        "timestamp": msg.timestamp.isoformat(),
        "room": room
    }
    emit("receive_message", payload, to=room)


# --------- Serve React build (optional if hosted together) ----------
# @app.route("/", defaults={"path": ""})
# @app.route("/<path:path>")
# def serve(path):
#     root_dir = os.path.join(os.getcwd(), "../frontend/build")
#     if path != "" and os.path.exists(os.path.join(root_dir, path)):
#         return send_from_directory(root_dir, path)
#     else:
#         return send_from_directory(root_dir, "index.html")
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    if path != "" and os.path.exists(f"../frontend/build/{path}"):
        return send_from_directory("../frontend/build", path)
    else:
        return send_from_directory("../frontend/build", "index.html")



if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 5000)))
