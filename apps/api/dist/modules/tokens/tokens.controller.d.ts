import { TokensService } from './tokens.service';
import { GenerateTokenDto } from './dto/generate-token.dto';
export declare class TokensController {
    private readonly tokensService;
    constructor(tokensService: TokensService);
    generateToken(dto: GenerateTokenDto): Promise<import("./entities/token.entity").Token>;
    getDoctorQueue(doctorId: string): Promise<import("./entities/token.entity").Token[]>;
}
