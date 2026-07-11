namespace CSharpStart.Models;
public sealed record Lesson(int Number, string Title, string Summary, string Goal, string[] Explanation, string ExampleCode, string ExampleOutput, string StarterCode, string SolutionCode, string[] RequiredTokens, string Hint);
