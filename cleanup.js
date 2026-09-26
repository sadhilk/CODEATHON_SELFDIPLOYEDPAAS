db.instances.updateMany(
  { status: { $in: ["HEALTHY","STARTING","UNHEALTHY","DRAINING"] } },
  { $set: { status: "STOPPED", stoppedAt: new Date() } }
);
db.projects.updateMany(
  { status: { $in: ["RUNNING","DEPLOYING"] } },
  { $set: { status: "STOPPED" } }
);
print("DB cleaned. Instances: " + db.instances.countDocuments() + " total");
