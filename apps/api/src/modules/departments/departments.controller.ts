import { Controller, Get, Post, Body, Patch, Delete, Param } from '@nestjs/common';
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

  @Patch(':id')
  async updateDepartment(
    @Param('id') id: string,
    @Body() body: { name: string; code: string; description?: string }
  ) {
    return this.departmentsService.update(id, body.name, body.code, body.description);
  }

  @Delete(':id')
  async deleteDepartment(@Param('id') id: string) {
    await this.departmentsService.remove(id);
    return { success: true };
  }
}
