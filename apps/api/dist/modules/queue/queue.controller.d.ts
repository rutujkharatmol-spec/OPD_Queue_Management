import { QueueService } from './queue.service';
import { MarkTokenActionDto } from './dto/mark-token-action.dto';
export declare class QueueController {
    private readonly queueService;
    constructor(queueService: QueueService);
    callNextPatient(doctorId: string): Promise<import("../tokens/entities/token.entity").Token>;
    markTokenAction(tokenId: string, dto: MarkTokenActionDto): Promise<import("../tokens/entities/token.entity").Token>;
}
