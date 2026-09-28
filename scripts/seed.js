import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INITIAL_TOPICS = [
  {
    name: 'PM-KISAN Scheme Eligibility',
    query: 'PM-KISAN eligibility income limit update',
    category: 'scheme',
    alertEmail: null
  },
  {
    name: 'SSC CGL 2026 Recruitment',
    query: 'SSC CGL 2026 notification exam date vacancies',
    category: 'exam',
    alertEmail: null
  },
  {
    name: 'UPSC CSE 2026 Notification',
    query: 'UPSC Civil Services Examination 2026 notification eligibility',
    category: 'exam',
    alertEmail: null
  }
];

async function seed() {
  console.log('Seeding initial topics into Supabase...');

  for (const topicData of INITIAL_TOPICS) {
    const existing = await prisma.topic.findFirst({
      where: { query: topicData.query }
    });

    if (existing) {
      console.log(`- Topic already exists: "${existing.name}" (${existing.id})`);
    } else {
      const created = await prisma.topic.create({
        data: topicData
      });
      console.log(`+ Created topic: "${created.name}" (${created.id})`);
    }
  }

  const total = await prisma.topic.count();
  console.log(`\nSeed complete. Total topics in database: ${total}`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
