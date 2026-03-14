import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;

// Mocking models and services for test
import { StaffUser } from '../src/modules/staff/models/StaffUser.js';
import { staffUserRepository } from '../src/modules/staff/repositories/staffUser.repository.js';

async function test() {
  await mongoose.connect(MONGO_URI);
  
  console.log('Testing staffUserRepository.findAll with undefined/empty filters...');
  
  const allUsers = await staffUserRepository.findAll({});
  console.log('Results (empty info):', allUsers.length);
  allUsers.forEach(u => console.log(`- ${u.name} (${u.role})`));

  const filterWithUndefined: any = { role: undefined, status: undefined };
  const allUsersUnderfined = await staffUserRepository.findAll(filterWithUndefined);
  console.log('Results (undefined filter):', allUsersUnderfined.length);
  allUsersUnderfined.forEach(u => console.log(`- ${u.name} (${u.role})`));

  await mongoose.disconnect();
}

test().catch(console.error);
