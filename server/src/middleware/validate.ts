import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        res.status(422).json({
          error: "Validation failed",
          statusCode: 422,
          details: formattedErrors,
        });
        return;
      }
      next(error);
    }
  };
};
