import { Controller, Get, Post, Body } from '@nestjs/common';
import { DepartmentsService } from './departments.service';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  async getDepartments() {
    return this.departmentsService.findAll();
  }

  @Post()
  async createDepartment(@Body() body: { name: string; code: string; description?: string }) {
    return this.departmentsService.create(body.name, body.code, body.description);
  }
}
