import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db;

  const mockJobs = await db
    .collection("jobs")
    .deleteMany({ source: "mock" });
  console.log(`[cleanup] deleted ${mockJobs.deletedCount} mock-sourced jobs`);

  const dupes = await db
    .collection("careeremails")
    .aggregate([
      { $group: { _id: { gmailMessageId: "$gmailMessageId", user: "$user" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
  console.log(`[cleanup] duplicate career email groups: ${dupes.length}`);
  for (const d of dupes) {
    console.log(
      `  gmailMessageId=${d._id.gmailMessageId} count=${d.count} ids=${d.ids.join(",")}`
    );
  }

  const exampleEmails = await db
    .collection("careeremails")
    .find({
      $or: [
        { gmailMessageId: "1a0ca29c66568f83" },
        { companyName: /TechNova Solutions/i },
      ],
    })
    .toArray();
  if (exampleEmails.length > 0) {
    const ids = exampleEmails.map((e) => e._id);
    const res = await db.collection("careeremails").deleteMany({ _id: { $in: ids } });
    console.log(`[cleanup] deleted ${res.deletedCount} example/test career emails (self-sent "TechNova Solutions" demo)`);
  } else {
    console.log("[cleanup] no example/test career emails found to delete");
  }

  const remaining = await db.collection("careeremails").countDocuments();
  const remainingJobs = await db.collection("jobs").countDocuments();
  console.log(`[cleanup] remaining career emails: ${remaining}, jobs: ${remainingJobs}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});