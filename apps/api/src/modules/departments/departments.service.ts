import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async findAll(): Promise<Department[]> {
    return this.departmentRepository.find({
      order: { createdAt: 'ASC' }
    });
  }

  async create(name: string, code: string, description?: string): Promise<Department> {
    const department = this.departmentRepository.create({
      name,
      code,
      description
    });
    return this.departmentRepository.save(department);
  }

  async update(id: string, name: string, code: string, description?: string): Promise<Department> {
    const department = await this.departmentRepository.findOne({ where: { id } });
    if (!department) throw new Error('Department not found');
    department.name = name;
    department.code = code;
    if (description !== undefined) department.description = description;
    return this.departmentRepository.save(department);
  }

  async remove(id: string): Promise<void> {
    await this.departmentRepository.delete(id);
  }
}
