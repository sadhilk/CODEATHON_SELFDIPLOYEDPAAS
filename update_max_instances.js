const mongoose = require('mongoose');
const Project = require('./control-plane/src/models/Project');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/resilify');
  const res = await Project.updateMany({}, { $set: { 'scaling.maxInstances': 20 } });
  console.log('Updated projects:', res.modifiedCount);
  process.exit(0);
}
run();
