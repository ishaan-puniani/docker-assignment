const express = require('express');
const os = require('os');
const { MongoClient, ObjectId } = require('mongodb');

const notes = new MongoClient(process.env.MONGO_URL).db('notesdb').collection('notes');
const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.set('X-Served-By', os.hostname()); // lets the UI show which replica answered
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode}`));
  next();
});

const toJson = (n) => ({ id: n._id.toString(), text: n.text });

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/notes', async (req, res) => {
  res.json((await notes.find().toArray()).map(toJson));
});

app.post('/notes', async (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (text.length < 1 || text.length > 500) return res.status(400).json({ error: 'text must be 1-500 characters' });
  const { insertedId } = await notes.insertOne({ text });
  res.status(201).json(toJson({ _id: insertedId, text }));
});

app.delete('/notes/:id', async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'invalid id' });
  const { deletedCount } = await notes.deleteOne({ _id: new ObjectId(req.params.id) });
  if (!deletedCount) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(process.env.PORT || 5000, () => console.log('notes-api listening'));
